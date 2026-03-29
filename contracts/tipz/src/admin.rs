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

/// Validate that X metric values are non-negative (structurally guaranteed for
/// `u32`) and within reasonable bounds.  Returns `true` when the values are
/// acceptable.
fn validate_x_metrics(_x_followers: u32, _x_engagement_avg: u32) -> bool {
    // u32 is always >= 0.  This hook exists so that additional upper-bound or
    // consistency checks can be added later without changing call-sites.
    true
}

/// Collect the addresses that would be skipped by [`batch_update_x_metrics`]
/// **without** modifying any on-chain state (dry-run / preview mode).
///
/// An address is skipped when it is not registered **or** when its metric
/// values fail validation.
pub fn batch_update_x_metrics_preview(
    env: &Env,
    caller: &Address,
    updates: Vec<(Address, u32, u32)>,
) -> Result<Vec<Address>, ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    let len = updates.len();
    if len > MAX_X_METRICS_BATCH_LEN {
        return Err(ContractError::BatchTooLarge);
    }
    let mut skipped: Vec<Address> = Vec::new(env);
    let mut i: u32 = 0;
    while i < len {
        let (creator, x_followers, x_engagement_avg) = updates.get(i).unwrap();
        if !storage::has_profile(env, &creator)
            || !validate_x_metrics(x_followers, x_engagement_avg)
        {
            skipped.push_back(creator);
        }
        i += 1;
    }
    Ok(skipped)
}

/// Update X metrics for many creators in one transaction. Admin only.
///
/// Entries for addresses without a registered profile or with invalid metric
/// values are skipped (with a per-entry event).  Returns a `Vec<Address>` of
/// all skipped addresses so the caller knows which entries were not applied.
///
/// An `XMetricsBatchCompleted` event is emitted at the end with the processed
/// count, skipped count, and the list of skipped addresses.
pub fn batch_update_x_metrics(
    env: &Env,
    caller: &Address,
    updates: Vec<(Address, u32, u32)>,
) -> Result<Vec<Address>, ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    let len = updates.len();
    if len > MAX_X_METRICS_BATCH_LEN {
        return Err(ContractError::BatchTooLarge);
    }
    let mut processed: u32 = 0;
    let mut skipped_addresses: Vec<Address> = Vec::new(env);
    let mut i: u32 = 0;
    while i < len {
        let (creator, x_followers, x_engagement_avg) = updates.get(i).unwrap();
        if !validate_x_metrics(x_followers, x_engagement_avg)
            || !storage::has_profile(env, &creator)
        {
            events::emit_x_metrics_batch_skipped(env, &creator);
            skipped_addresses.push_back(creator);
        } else {
            apply_x_metrics_to_profile(env, &creator, x_followers, x_engagement_avg);
            processed += 1;
        }
        i += 1;
    }
    let skipped_count = skipped_addresses.len();
    events::emit_x_metrics_batch_completed(
        env,
        processed,
        skipped_count,
        skipped_addresses.clone(),
    );
    Ok(skipped_addresses)
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
    storage::set_admin(env, new_admin);
    events::emit_admin_changed(env, &old_admin, new_admin);
    Ok(())
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
    env.deployer().update_current_contract_wasm(new_wasm_hash.clone());
    let new_version = storage::get_version(env) + 1;
    storage::set_version(env, new_version);
    Ok(())
}
