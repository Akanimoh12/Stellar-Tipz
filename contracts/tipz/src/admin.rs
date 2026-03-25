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

/// Update X metrics for many creators in one transaction. Admin only.
///
/// Entries for addresses without a registered profile are skipped and a
/// batch-skip event is recorded for each skip. Returns the number of profiles
/// successfully updated.
pub fn batch_update_x_metrics(
    env: &Env,
    caller: &Address,
    updates: Vec<(Address, u32, u32)>,
) -> Result<u32, ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;

    let len = updates.len();
    if len > MAX_X_METRICS_BATCH_LEN {
        return Err(ContractError::BatchTooLarge);
    }

    let mut updated: u32 = 0;
    let mut i: u32 = 0;
    while i < len {
        let (creator, x_followers, x_engagement_avg) = updates.get(i).unwrap();
        if !storage::has_profile(env, &creator) {
            events::emit_x_metrics_batch_skipped(env, &creator);
        } else {
            apply_x_metrics_to_profile(env, &creator, x_followers, x_engagement_avg);
            updated += 1;
        }
        i += 1;
    }

    Ok(updated)
}

/// Extend the contract instance TTL manually. Admin only.
pub fn bump_ttl(env: &Env, caller: &Address) -> Result<(), ContractError> {
    require_admin(env, caller)?;
    storage::extend_instance_ttl(env);
    Ok(())
}

// TODO: Implement set_fee, set_fee_collector, set_admin in issues #20, #21, #22
