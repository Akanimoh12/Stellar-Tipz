//! Admin operations for the Tipz contract.
//!
//! - Contract initialization
//! - Fee management
//! - Admin role transfer

use soroban_sdk::{Address, Env, Vec};

use crate::credit;
use crate::errors::ContractError;
use crate::events;
use crate::storage::{self, DataKey};
use crate::types::{AdminChangeHistoryEntry, AdminChangeProposal, BatchSkip};

pub fn require_admin(env: &Env, caller: &Address) -> Result<(), ContractError> {
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }
    let admin = storage::get_admin(env);
    if caller != &admin {
        return Err(ContractError::NotAuthorized);
    }
    caller.require_auth();
    Ok(())
}

pub fn require_not_paused(env: &Env) -> Result<(), ContractError> {
    if storage::is_paused(env) {
        return Err(ContractError::ContractPaused);
    }
    Ok(())
}

/// Initialize the contract. Can only be called once.
pub fn initialize(
    env: &Env,
    admin: &Address,
    fee_collector: &Address,
    fee_bps: u32,
    native_token: &Address,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);

    if storage::is_initialized(env) {
        return Err(ContractError::AlreadyInitialized);
    }
    if fee_bps > 1000 {
        return Err(ContractError::InvalidFee);
    }
    storage::set_initialized(env);
    storage::set_admin(env, admin);
    storage::set_fee_collector(env, fee_collector);
    storage::set_fee_bps(env, fee_bps);
    storage::set_native_token(env, native_token);
    storage::set_paused(env, false);
    storage::set_min_tip_amount(env, 1_000_000_i128);
    storage::set_version(env, crate::CONTRACT_VERSION);

    // Initialise counters to zero so reads never return None.
    env.storage()
        .instance()
        .set(&DataKey::TotalCreators, &0_u32);
    env.storage().instance().set(&DataKey::TipCount, &0_u32);
    env.storage()
        .instance()
        .set(&DataKey::TotalTipsVolume, &0_i128);
    env.storage()
        .instance()
        .set(&DataKey::TotalFeesCollected, &0_i128);

    Ok(())
}

/// Maximum number of creators in a single [`batch_update_x_metrics`] call.
pub const MAX_X_METRICS_BATCH_LEN: u32 = 50;

/// Waiting period before a proposed new admin may call [`confirm_admin_change`].
pub const ADMIN_CHANGE_TIMELOCK_SECS: u64 = 48 * 3600;

/// Maximum entries returned by [`get_admin_change_history`] in one call.
pub const MAX_ADMIN_HISTORY_RETURN: u32 = 50;

/// Apply X metric fields and recalculate credit score for a profile that is
/// already known to exist in storage.
fn apply_x_metrics_to_profile(
    env: &Env,
    creator: &Address,
    x_followers: u32,
    x_engagement_avg: u32,
) {
    let mut profile = storage::get_profile(env, creator);
    let old_score = profile.credit_score;
    let now = env.ledger().timestamp();

    profile.x_followers = x_followers;
    profile.x_engagement_avg = x_engagement_avg;
    profile.updated_at = now;

    let new_score = credit::calculate_credit_score(&profile, now);
    profile.credit_score = new_score;
    storage::set_profile(env, &profile);

    if old_score != new_score {
        events::emit_credit_score_updated(env, creator, old_score, new_score);
    }
}

/// Update a creator's X metrics. Admin only.
pub fn update_x_metrics(
    env: &Env,
    caller: &Address,
    creator: &Address,
    x_followers: u32,
    x_engagement_avg: u32,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }
    apply_x_metrics_to_profile(env, creator, x_followers, x_engagement_avg);
    Ok(())
}

/// Maximum number of X followers accepted as a valid metric value.
/// Set to 500 million — well above the realistic ceiling for any single account.
const MAX_X_FOLLOWERS: u32 = 500_000_000;

/// Maximum average X engagement per post accepted as a valid metric value.
/// Set to 1 million — a generous upper bound for any realistic engagement figure.
const MAX_X_ENGAGEMENT_AVG: u32 = 1_000_000;

/// Validate that X metric values fall within acceptable bounds.
/// Returns `true` when both values are within the defined upper limits.
fn validate_x_metrics(x_followers: u32, x_engagement_avg: u32) -> bool {
    x_followers <= MAX_X_FOLLOWERS && x_engagement_avg <= MAX_X_ENGAGEMENT_AVG
}

/// Collect the entries that would be skipped by [`batch_update_x_metrics`]
/// **without** modifying any on-chain state (dry-run / preview mode).
///
/// An entry is skipped when the address is not registered (`reason = 0`) or
/// when its metric values fail validation (`reason = 1`).
pub fn batch_update_x_metrics_preview(
    env: &Env,
    caller: &Address,
    updates: Vec<(Address, u32, u32)>,
) -> Result<Vec<BatchSkip>, ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    let len = updates.len();
    if len > MAX_X_METRICS_BATCH_LEN {
        return Err(ContractError::BatchTooLarge);
    }
    let mut skipped: Vec<BatchSkip> = Vec::new(env);
    let mut i: u32 = 0;
    while i < len {
        let (creator, x_followers, x_engagement_avg) = updates.get(i).unwrap();
        if !storage::has_profile(env, &creator) {
            skipped.push_back(BatchSkip {
                address: creator,
                reason: 0,
            });
        } else if !validate_x_metrics(x_followers, x_engagement_avg) {
            skipped.push_back(BatchSkip {
                address: creator,
                reason: 1,
            });
        }
        i += 1;
    }
    Ok(skipped)
}

/// Update X metrics for many creators in one transaction. Admin only.
///
/// Entries are skipped when the address is not registered (`reason = 0`) or
/// when metric values fail validation (`reason = 1`).  A per-entry
/// `batch_skipped` event is emitted for each skip with the reason code.
///
/// Returns a `Vec<BatchSkip>` describing every skipped entry so the caller
/// knows exactly which entries were not applied and why.
///
/// An `XMetricsBatchCompleted` event is emitted at the end with the processed
/// count, skipped count, and the full list of skipped entries.
pub fn batch_update_x_metrics(
    env: &Env,
    caller: &Address,
    updates: Vec<(Address, u32, u32)>,
) -> Result<Vec<BatchSkip>, ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    let len = updates.len();
    if len > MAX_X_METRICS_BATCH_LEN {
        return Err(ContractError::BatchTooLarge);
    }
    let mut processed: u32 = 0;
    let mut skipped: Vec<BatchSkip> = Vec::new(env);
    let mut i: u32 = 0;
    while i < len {
        let (creator, x_followers, x_engagement_avg) = updates.get(i).unwrap();
        if !storage::has_profile(env, &creator) {
            events::emit_x_metrics_batch_skipped(env, &creator, 0);
            skipped.push_back(BatchSkip {
                address: creator,
                reason: 0,
            });
        } else if !validate_x_metrics(x_followers, x_engagement_avg) {
            events::emit_x_metrics_batch_skipped(env, &creator, 1);
            skipped.push_back(BatchSkip {
                address: creator,
                reason: 1,
            });
        } else {
            apply_x_metrics_to_profile(env, &creator, x_followers, x_engagement_avg);
            processed += 1;
        }
        i += 1;
    }
    let skipped_count = skipped.len();
    events::emit_x_metrics_batch_completed(env, processed, skipped_count, skipped.clone());
    Ok(skipped)
}

/// Extend the contract instance TTL manually. Admin only.
pub fn bump_ttl(env: &Env, caller: &Address) -> Result<(), ContractError> {
    require_admin(env, caller)?;
    storage::extend_instance_ttl(env);
    Ok(())
}

/// Update the withdrawal fee in basis points (max 1000 = 10%). Admin only.
pub fn set_fee(env: &Env, caller: &Address, fee_bps: u32) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    if fee_bps > 1000 {
        return Err(ContractError::InvalidFee);
    }
    let old_bps = storage::get_fee_bps(env);
    storage::set_fee_bps(env, fee_bps);
    events::emit_fee_updated(env, old_bps, fee_bps);
    Ok(())
}

/// Update the fee collector address. Admin only.
pub fn set_fee_collector(
    env: &Env,
    caller: &Address,
    new_collector: &Address,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    storage::set_fee_collector(env, new_collector);
    events::emit_fee_collector_updated(env, new_collector);
    Ok(())
}

/// Transfer the admin role to a new address. Admin only.
pub fn set_admin(env: &Env, caller: &Address, new_admin: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    let old_admin = storage::get_admin(env);
    if new_admin == &old_admin {
        return Err(ContractError::NotAuthorized);
    }
    storage::remove_pending_admin_change(env);
    storage::set_admin(env, new_admin);
    events::emit_admin_changed(env, &old_admin, new_admin);
    let now = env.ledger().timestamp();
    storage::append_admin_change_history(
        env,
        &AdminChangeHistoryEntry {
            old_admin: old_admin.clone(),
            new_admin: new_admin.clone(),
            confirmed_at: now,
        },
    );
    Ok(())
}

/// Propose a new admin with a 48-hour time lock. Current admin only.
///
/// At most one pending proposal: cancel it before proposing a different successor.
pub fn propose_admin_change(
    env: &Env,
    caller: &Address,
    new_admin: &Address,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    let current = storage::get_admin(env);
    if new_admin == &current {
        return Err(ContractError::NotAuthorized);
    }
    if storage::get_pending_admin_change(env).is_some() {
        return Err(ContractError::AdminChangeAlreadyPending);
    }
    let now = env.ledger().timestamp();
    let confirmable_after = now
        .checked_add(ADMIN_CHANGE_TIMELOCK_SECS)
        .ok_or(ContractError::OverflowError)?;
    let proposal = AdminChangeProposal {
        new_admin: new_admin.clone(),
        confirmable_after,
    };
    storage::set_pending_admin_change(env, &proposal);
    events::emit_admin_change_proposed(env, &current, new_admin, confirmable_after);
    Ok(())
}

/// Confirm a pending admin change after the time lock. Only the proposed `new_admin` may call this.
pub fn confirm_admin_change(env: &Env, caller: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }
    let proposal = storage::get_pending_admin_change(env).ok_or(ContractError::NoPendingAdmin)?;
    if caller != &proposal.new_admin {
        return Err(ContractError::NotAuthorized);
    }
    caller.require_auth();
    let now = env.ledger().timestamp();
    if now < proposal.confirmable_after {
        return Err(ContractError::AdminChangeTimelockNotMet);
    }
    let old_admin = storage::get_admin(env);
    storage::set_admin(env, caller);
    storage::remove_pending_admin_change(env);
    events::emit_admin_change_confirmed(env, &old_admin, caller);
    events::emit_admin_changed(env, &old_admin, caller);
    storage::append_admin_change_history(
        env,
        &AdminChangeHistoryEntry {
            old_admin: old_admin.clone(),
            new_admin: caller.clone(),
            confirmed_at: now,
        },
    );
    Ok(())
}

/// Cancel a pending time-locked admin change. Current admin only.
pub fn cancel_admin_change(env: &Env, caller: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    if storage::get_pending_admin_change(env).is_none() {
        return Err(ContractError::NoPendingAdmin);
    }
    storage::remove_pending_admin_change(env);
    events::emit_admin_proposal_cancelled(env, caller);
    Ok(())
}

/// Return the pending admin-change proposal, if any.
pub fn get_admin_change_proposal(env: &Env) -> Result<Option<AdminChangeProposal>, ContractError> {
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }
    Ok(storage::get_pending_admin_change(env))
}

/// Return recent admin change history entries, newest first.
pub fn get_admin_change_history(
    env: &Env,
    limit: u32,
    offset: u32,
) -> Result<soroban_sdk::Vec<AdminChangeHistoryEntry>, ContractError> {
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }
    let n = storage::get_admin_change_history_next_id(env);
    let mut out: soroban_sdk::Vec<AdminChangeHistoryEntry> = soroban_sdk::Vec::new(env);
    if n == 0 {
        return Ok(out);
    }
    let cap = if limit == 0 || limit > MAX_ADMIN_HISTORY_RETURN {
        MAX_ADMIN_HISTORY_RETURN
    } else {
        limit
    };
    if offset >= n {
        return Ok(out);
    }
    let mut cur = n - 1 - offset;
    let mut taken: u32 = 0;
    while taken < cap {
        if let Some(entry) = storage::get_admin_change_history_entry(env, cur) {
            out.push_back(entry);
        }
        if cur == 0 {
            break;
        }
        cur -= 1;
        taken += 1;
    }
    Ok(out)
}

pub fn pause(env: &Env, caller: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    storage::set_paused(env, true);
    events::emit_contract_paused(env, caller);
    Ok(())
}

pub fn unpause(env: &Env, caller: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    storage::set_paused(env, false);
    events::emit_contract_unpaused(env, caller);
    Ok(())
}

pub fn set_min_tip_amount(env: &Env, caller: &Address, amount: i128) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    if amount < 0 {
        return Err(ContractError::InvalidAmount);
    }
    let old = storage::get_min_tip_amount(env);
    storage::set_min_tip_amount(env, amount);
    events::emit_min_tip_amount_updated(env, old, amount);
    Ok(())
}

/// Upgrade the contract to a new WASM hash. Admin only.
pub fn upgrade(
    env: &Env,
    caller: &Address,
    new_wasm_hash: &soroban_sdk::BytesN<32>,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    env.deployer()
        .update_current_contract_wasm(new_wasm_hash.clone());
    let new_version = storage::get_version(env) + 1;
    storage::set_version(env, new_version);
    Ok(())
}
