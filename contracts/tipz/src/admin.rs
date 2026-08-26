//! Admin operations for the Tipz contract.
//!
//! - Contract initialization
//! - Fee management
//! - Admin role transfer

use soroban_sdk::{Address, BytesN, Env, String, Symbol, Vec};

use crate::credit;
use crate::errors::ContractError;
use crate::events;
use crate::storage::{self, DataKey, ExtendedDataKey};
use crate::types::{AdminAuditEntry, AdminChangeHistoryEntry, AdminChangeProposal, BatchSkip};

/// Documented minimum fee-change delay in ledgers.
pub const MIN_FEE_CHANGE_DELAY_LEDGERS: u32 = 24;
/// Default fee-change delay in ledgers.
pub const DEFAULT_FEE_CHANGE_DELAY_LEDGERS: u32 = 24 * 12;

pub fn u32_to_string(env: &Env, val: u32) -> String {
    let mut buf = [0u8; 10];
    let mut i = buf.len();
    let mut num = val;
    if num == 0 {
        return String::from_str(env, "0");
    }
    while num > 0 {
        i -= 1;
        buf[i] = b'0' + (num % 10) as u8;
        num /= 10;
    }
    let s = core::str::from_utf8(&buf[i..]).unwrap_or("0");
    String::from_str(env, s)
}

pub fn u64_to_string(env: &Env, val: u64) -> String {
    let mut buf = [0u8; 20];
    let mut i = buf.len();
    let mut num = val;
    if num == 0 {
        return String::from_str(env, "0");
    }
    while num > 0 {
        i -= 1;
        buf[i] = b'0' + (num % 10) as u8;
        num /= 10;
    }
    let s = core::str::from_utf8(&buf[i..]).unwrap_or("0");
    String::from_str(env, s)
}

pub fn i128_to_string(env: &Env, val: i128) -> String {
    let mut buf = [0u8; 40];
    let mut i = buf.len();
    let is_neg = val < 0;
    let mut num = if is_neg { -val } else { val };
    if num == 0 {
        return String::from_str(env, "0");
    }
    while num > 0 {
        i -= 1;
        buf[i] = b'0' + (num % 10) as u8;
        num /= 10;
    }
    if is_neg {
        i -= 1;
        buf[i] = b'-';
    }
    let s = core::str::from_utf8(&buf[i..]).unwrap_or("0");
    String::from_str(env, s)
}

pub fn bool_to_string(env: &Env, val: bool) -> String {
    if val {
        String::from_str(env, "true")
    } else {
        String::from_str(env, "false")
    }
}

/// Record a privileged admin action in the ring-buffered audit log and emit an audit event.
pub fn log_admin_action(
    env: &Env,
    actor: &Address,
    action_kind: Symbol,
    before_value: String,
    after_value: String,
) {
    let entry =
        storage::append_admin_audit_entry(env, actor, action_kind, &before_value, &after_value);
    events::emit_admin_audit_log(env, &entry);
}

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

/// Guard for privileged actions that must route through multisig once it is enabled (#1155).
///
/// Covers: fee changes, admin transfer, pause/unpause, and upgrade. When multisig is
/// enabled these entrypoints error instead of executing directly; callers must instead
/// go through `propose_action`/`approve_action` in `multisig.rs`. With multisig disabled,
/// this is a no-op and behaviour is unchanged.
fn require_no_multisig(env: &Env) -> Result<(), ContractError> {
    if crate::multisig::is_multisig_enabled(env) {
        return Err(ContractError::MultisigRequired);
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
    storage::set_min_withdrawal_amount(env, 1_000_000_i128);
    let breaker_config = storage::default_circuit_breaker_config();
    storage::set_circuit_breaker_config(env, &breaker_config);
    storage::reset_circuit_breaker_status(env, breaker_config.bucket_count);
    storage::set_version(env, crate::CONTRACT_VERSION);
    storage::set_reentrancy_guard(env, false);
    storage::set_runtime_config(
        env,
        &storage::RuntimeConfig {
            admin: admin.clone(),
            fee_collector: fee_collector.clone(),
            fee_bps,
            fee_change_delay_ledgers: DEFAULT_FEE_CHANGE_DELAY_LEDGERS,
            native_token: native_token.clone(),
            paused: false,
            min_tip_amount: 1_000_000_i128,
            rate_limit: crate::types::RateLimitConfig {
                max_ops: 50,
                window_secs: 3600,
            },
            domain_reverify_secs: storage::DEFAULT_DOMAIN_REVERIFICATION_INTERVAL,
        },
    );
    storage::set_leaderboard_set(
        env,
        &storage::LeaderboardSet {
            all_time: Vec::new(env),
            monthly: Vec::new(env),
            weekly: Vec::new(env),
            monthly_reset_at: 0,
            weekly_reset_at: 0,
        },
    );
    storage::set_send_tip_state(
        env,
        &storage::SendTipState {
            tip_count: 0,
            total_tips_volume: 0,
            stats_window_start: 0,
            tips_last_24h: 0,
            volume_last_24h: 0,
            active_creators_30d: 0,
        },
    );

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
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "update_x_metrics"),
        String::from_str(env, ""),
        u32_to_string(env, x_followers),
    );
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
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "update_x_metrics"),
        String::from_str(env, "batch"),
        u32_to_string(env, processed),
    );
    Ok(skipped)
}

/// Extend the contract instance TTL manually. Admin only.
pub fn bump_ttl(env: &Env, caller: &Address) -> Result<(), ContractError> {
    require_admin(env, caller)?;
    storage::extend_instance_ttl(env);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "bump_ttl"),
        String::from_str(env, ""),
        String::from_str(env, "bumped"),
    );
    Ok(())
}

/// Update the withdrawal fee in basis points (max 1000 = 10%). Admin only.
pub fn set_fee(env: &Env, caller: &Address, fee_bps: u32) -> Result<(), ContractError> {
    propose_fee_change(env, caller, fee_bps)?;
    apply_fee_change_inner(env)
}

/// Update the fee-change delay in ledgers. Admin only.
///
/// The delay is intentionally bounded below by [`MIN_FEE_CHANGE_DELAY_LEDGERS`] so
/// an admin cannot shrink the warning window to zero and surprise creators.
pub fn set_fee_change_delay(
    env: &Env,
    caller: &Address,
    delay_ledgers: u32,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    require_no_multisig(env)?;
    if delay_ledgers < MIN_FEE_CHANGE_DELAY_LEDGERS {
        return Err(ContractError::InvalidInput);
    }
    let old_delay = storage::get_fee_change_delay_ledgers(env);
    storage::set_fee_change_delay_ledgers(env, delay_ledgers);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "set_fee_delay"),
        u32_to_string(env, old_delay),
        u32_to_string(env, delay_ledgers),
    );
    Ok(())
}

/// Propose a withdrawal-fee change.
///
/// Fee increases are timelocked; decreases may be applied immediately, but
/// still pass through the same proposal record so clients can warn users.
pub fn propose_fee_change(env: &Env, caller: &Address, fee_bps: u32) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    require_no_multisig(env)?;
    let (old_bps, new_bps) = propose_fee_change_inner(env, fee_bps)?;
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "propose_fee_change"),
        u32_to_string(env, old_bps),
        u32_to_string(env, new_bps),
    );
    Ok(())
}

/// Internal fee proposal helper used by both direct admin calls and multisig-executed actions.
pub fn propose_fee_change_inner(env: &Env, fee_bps: u32) -> Result<(u32, u32), ContractError> {
    if fee_bps > 1000 {
        return Err(ContractError::InvalidFee);
    }
    let old_bps = storage::get_fee_bps(env);
    let current_ledger = env.ledger().sequence();
    let increase = fee_bps > old_bps;
    let delay = storage::get_fee_change_delay_ledgers(env);
    if delay < MIN_FEE_CHANGE_DELAY_LEDGERS {
        return Err(ContractError::InvalidInput);
    }
    if storage::get_pending_fee_change(env).is_some() {
        return Err(ContractError::InvalidInput);
    }
    let effective_ledger = if increase {
        current_ledger
            .checked_add(delay)
            .ok_or(ContractError::OverflowError)?
    } else {
        current_ledger
    };
    storage::set_pending_fee_change(env, &(fee_bps, effective_ledger, current_ledger, !increase));
    events::emit_fee_change_proposed(env, old_bps, fee_bps, effective_ledger, !increase);
    Ok((old_bps, fee_bps))
}

/// Apply a pending withdrawal-fee change.
pub fn apply_fee_change(env: &Env, caller: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    apply_fee_change_inner(env)
}

fn apply_fee_change_inner(env: &Env) -> Result<(), ContractError> {
    let pending = storage::get_pending_fee_change(env).ok_or(ContractError::NotFound)?;
    let current_ledger = env.ledger().sequence();
    if !pending.3 && current_ledger < pending.1 {
        return Err(ContractError::InvalidInput);
    }
    if pending.0 > 1000 {
        return Err(ContractError::InvalidFee);
    }
    let old_bps = storage::get_fee_bps(env);
    storage::set_fee_bps(env, pending.0);
    storage::clear_pending_fee_change(env);
    events::emit_fee_updated(env, old_bps, pending.0);
    events::emit_fee_change_applied(env, old_bps, pending.0);
    log_admin_action(
        env,
        &env.current_contract_address(),
        Symbol::new(env, "apply_fee_change"),
        u32_to_string(env, old_bps),
        u32_to_string(env, pending.0),
    );
    Ok(())
}

/// Cancel a pending withdrawal-fee change.
pub fn cancel_fee_change(env: &Env, caller: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    require_no_multisig(env)?;
    let pending = storage::get_pending_fee_change(env).ok_or(ContractError::NotFound)?;
    storage::clear_pending_fee_change(env);
    events::emit_fee_change_cancelled(env, caller, pending.0);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "cancel_fee_change"),
        u32_to_string(env, pending.0),
        String::from_str(env, "cancelled"),
    );
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
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "set_fee_collector"),
        String::from_str(env, "old_collector"),
        String::from_str(env, "new_collector"),
    );
    Ok(())
}

/// Proposal expiration window after which pending admin proposal expires (7 days).
pub const ADMIN_PROPOSAL_EXPIRY_SECS: u64 = 7 * 86_400;

/// Time-delayed emergency withdrawal pause threshold (7 days).
/// Documented security rationale: 7 days gives the core team and security responders sufficient
/// window to assess and remediate high-severity smart contract exploits before creators may unlock
/// funds during a contract pause.
pub const EMERGENCY_WITHDRAWAL_DELAY_SECS: u64 = 7 * 86_400;

/// Transfer the admin role to a new address. Admin only.
/// Note: Single-step transfer is disabled to enforce two-step proposal flow everywhere (#1179).
pub fn set_admin(env: &Env, caller: &Address, _new_admin: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    Err(ContractError::NotAuthorized)
}

/// Propose a new admin with a 48-hour time lock and 7-day expiration. Current admin only.
///
/// At most one pending proposal: cancel it before proposing a different successor.
pub fn propose_admin_change(
    env: &Env,
    caller: &Address,
    new_admin: &Address,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    require_no_multisig(env)?;
    let current = storage::get_admin(env);
    if new_admin == &current {
        return Err(ContractError::NotAuthorized);
    }
    if storage::get_pending_admin_change(env).is_some() {
        return Err(ContractError::AdminChangePending);
    }
    let now = env.ledger().timestamp();
    let confirmable_after = now
        .checked_add(ADMIN_CHANGE_TIMELOCK_SECS)
        .ok_or(ContractError::OverflowError)?;
    let expires_at = confirmable_after
        .checked_add(ADMIN_PROPOSAL_EXPIRY_SECS)
        .ok_or(ContractError::OverflowError)?;
    let proposal = AdminChangeProposal {
        new_admin: new_admin.clone(),
        confirmable_after,
        expires_at,
    };
    storage::set_pending_admin_change(env, &proposal);
    events::emit_admin_change_proposed(env, &current, new_admin, confirmable_after);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "propose_admin_change"),
        String::from_str(env, "current_admin"),
        String::from_str(env, "proposed_admin"),
    );
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
    if now > proposal.expires_at {
        storage::remove_pending_admin_change(env);
        return Err(ContractError::AdminProposalExpired);
    }
    if now < proposal.confirmable_after {
        return Err(ContractError::AdminTimelockNotMet);
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
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "confirm_admin_change"),
        String::from_str(env, "old_admin"),
        String::from_str(env, "new_admin"),
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
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "cancel_admin_change"),
        String::from_str(env, "pending"),
        String::from_str(env, "cancelled"),
    );
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

/// Maximum entries returned by [`get_admin_audit_history`] in one call.
pub const MAX_ADMIN_AUDIT_HISTORY_RETURN: u32 = 50;

/// Return recent admin audit log entries, newest first.
pub fn get_admin_audit_history(
    env: &Env,
    limit: u32,
    offset: u32,
) -> Result<soroban_sdk::Vec<AdminAuditEntry>, ContractError> {
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }
    let log = storage::load_admin_audit_log(env);
    let n = log.len();
    let mut out: soroban_sdk::Vec<AdminAuditEntry> = soroban_sdk::Vec::new(env);
    if n == 0 {
        return Ok(out);
    }
    let cap = if limit == 0 || limit > MAX_ADMIN_AUDIT_HISTORY_RETURN {
        MAX_ADMIN_AUDIT_HISTORY_RETURN
    } else {
        limit
    };
    if offset >= n {
        return Ok(out);
    }
    let mut cur = n - 1 - offset;
    let mut taken: u32 = 0;
    while taken < cap {
        if let Some(entry) = log.get(cur) {
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
    require_no_multisig(env)?;
    storage::set_paused(env, true);
    events::emit_contract_paused(env, caller);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "pause"),
        bool_to_string(env, false),
        bool_to_string(env, true),
    );
    Ok(())
}

pub fn unpause(env: &Env, caller: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    require_no_multisig(env)?;
    storage::set_paused(env, false);
    events::emit_contract_unpaused(env, caller);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "unpause"),
        bool_to_string(env, true),
        bool_to_string(env, false),
    );
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
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "set_min_tip_amount"),
        i128_to_string(env, old),
        i128_to_string(env, amount),
    );
    Ok(())
}

pub fn set_min_withdrawal_amount(
    env: &Env,
    caller: &Address,
    amount: i128,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    if amount < 0 {
        return Err(ContractError::InvalidAmount);
    }
    let old = storage::get_min_withdrawal_amount(env);
    storage::set_min_withdrawal_amount(env, amount);
    events::emit_min_withdrawal_amount_updated(env, old, amount);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "set_min_withdrawal"),
        i128_to_string(env, old),
        i128_to_string(env, amount),
    );
    Ok(())
}

/// Admin confirms domain verification after off-chain stellar.toml check.
pub fn verify_domain(env: &Env, caller: &Address, creator: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;

    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    let mut profile = storage::get_profile(env, creator);
    if profile.domain.is_empty() {
        return Err(ContractError::InvalidDomain);
    }
    if profile.domain_verified {
        return Err(ContractError::AlreadyVerified);
    }

    let now = env.ledger().timestamp();
    profile.domain_verified = true;
    profile.domain_verified_at = Some(now);
    profile.verification = crate::types::VerificationStatus {
        is_verified: true,
        verification_type: crate::types::VerificationType::Identity,
        verified_at: Some(now),
        revoked_at: None,
    };
    profile.updated_at = now;

    storage::set_profile(env, &profile);
    storage::bump_profile_ttl(env, creator);
    storage::bump_username_ttl(env, &profile.username);

    events::emit_domain_verified(env, creator, &profile.domain);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "verify_domain"),
        String::from_str(env, "unverified"),
        profile.domain.clone(),
    );
    Ok(())
}

/// Configure how often domain verifications must be renewed (admin only).
pub fn set_domain_reverify_interval(
    env: &Env,
    caller: &Address,
    interval_secs: u64,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    if interval_secs == 0 {
        return Err(ContractError::InvalidAmount);
    }
    let old_interval = storage::get_domain_reverification_interval(env);
    storage::set_domain_reverification_interval(env, interval_secs);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "set_domain_reverify_interval"),
        u64_to_string(env, old_interval),
        u64_to_string(env, interval_secs),
    );
    Ok(())
}

/// Store a proposed WASM hash for dry-run verification before execution.
pub fn propose_upgrade(
    env: &Env,
    caller: &Address,
    new_wasm_hash: &BytesN<32>,
) -> Result<BytesN<32>, ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    env.storage()
        .instance()
        .set(&ExtendedDataKey::ProposedUpgradeHash, new_wasm_hash);
    events::emit_upgrade_proposed(env, new_wasm_hash);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "propose_upgrade"),
        String::from_str(env, ""),
        String::from_str(env, "proposed"),
    );
    Ok(new_wasm_hash.clone())
}

pub fn get_proposed_upgrade(env: &Env) -> Option<BytesN<32>> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::ProposedUpgradeHash)
}

pub fn cancel_upgrade(env: &Env, caller: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    env.storage()
        .instance()
        .remove(&ExtendedDataKey::ProposedUpgradeHash);
    events::emit_upgrade_cancelled(env, caller);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "cancel_upgrade"),
        String::from_str(env, "proposed"),
        String::from_str(env, "cancelled"),
    );
    Ok(())
}

/// Upgrade the contract to a previously proposed WASM hash. Admin only.
pub fn upgrade(
    env: &Env,
    caller: &Address,
    new_wasm_hash: &soroban_sdk::BytesN<32>,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;
    require_no_multisig(env)?;
    let proposed = get_proposed_upgrade(env).ok_or(ContractError::NotFound)?;
    if proposed != new_wasm_hash.clone() {
        return Err(ContractError::InvalidInput);
    }
    env.deployer()
        .update_current_contract_wasm(new_wasm_hash.clone());
    env.storage()
        .instance()
        .remove(&ExtendedDataKey::ProposedUpgradeHash);
    let old_version = storage::get_version(env);
    let new_version = old_version + 1;
    storage::set_version(env, new_version);
    log_admin_action(
        env,
        caller,
        Symbol::new(env, "upgrade"),
        u32_to_string(env, old_version),
        u32_to_string(env, new_version),
    );
    Ok(())
}
