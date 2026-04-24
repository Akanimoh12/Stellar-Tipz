//! Tip record storage and transfer logic for the Tipz contract.
//!
//! Tips are stored in temporary storage so they expire automatically after a
//! bounded lifetime, while aggregate counters remain in persistent contract
//! state.

use soroban_sdk::{Address, Env, String, Vec};

use crate::credit;
use crate::errors::ContractError;
use crate::events::emit_tip_sent;
use crate::leaderboard;
use crate::storage::{self, DataKey};
use crate::token;
use crate::types::Tip;

/// Create a new [`Tip`] record and store it in temporary storage.
pub fn store_tip(
    env: &Env,
    tipper: &Address,
    creator: &Address,
    amount: i128,
    message: String,
    is_anonymous: bool,
) -> u32 {
    let tip_id = storage::increment_tip_count(env);
    let key = DataKey::Tip(tip_id);
    let tip = Tip {
        id: tip_id,
        tipper: if is_anonymous {
            None
        } else {
            Some(tipper.clone())
        },
        creator: creator.clone(),
        amount,
        message,
        timestamp: env.ledger().timestamp(),
        is_anonymous,
    };

    env.storage().temporary().set(&key, &tip);
    storage::set_tip_ttl(env, &key);

    tip_id
}

/// Retrieve a single tip by its ID.
pub fn get_tip(env: &Env, tip_id: u32) -> Option<Tip> {
    env.storage().temporary().get(&DataKey::Tip(tip_id))
}

/// Maximum number of tips returned per page.
const MAX_PAGE_LIMIT: u32 = 50;

/// Return up to `limit` recent tips received by `creator`, newest first,
/// starting from `offset` entries back in the creator's tip index.
///
/// - `limit` is capped at 50.
/// - `offset` of 0 means start from the most recent tip.
/// - Expired tips are silently skipped; the result may contain fewer entries.
pub fn get_recent_tips(env: &Env, creator: &Address, limit: u32, offset: u32) -> Vec<Tip> {
    let limit = if limit > MAX_PAGE_LIMIT {
        MAX_PAGE_LIMIT
    } else {
        limit
    };
    let count = storage::get_creator_tip_count(env, creator);
    let mut result = Vec::new(env);
    let mut found = 0_u32;

    // Start iterating from (count - offset) downward
    let start = count.saturating_sub(offset);
    let mut index = start;

    while index > 0 && found < limit {
        index -= 1;
        if let Some(tip_id) = env
            .storage()
            .temporary()
            .get::<DataKey, u32>(&DataKey::CreatorTip(creator.clone(), index))
        {
            if let Some(tip) = get_tip(env, tip_id) {
                result.push_back(tip);
                found += 1;
            }
        }
    }

    result
}

/// Return up to `limit` recent tips sent by `tipper`, newest first.
///
/// Expired tips are silently skipped, so the returned vector may contain fewer
/// than `limit` entries.
pub fn get_tips_by_tipper(env: &Env, tipper: &Address, limit: u32) -> Vec<Tip> {
    let count = storage::get_tipper_tip_count(env, tipper);
    let mut result = Vec::new(env);
    let mut found = 0_u32;
    let mut index = count;

    while index > 0 && found < limit {
        index -= 1;
        if let Some(tip_id) = env
            .storage()
            .temporary()
            .get::<DataKey, u32>(&DataKey::TipperTip(tipper.clone(), index))
        {
            if let Some(tip) = get_tip(env, tip_id) {
                result.push_back(tip);
                found += 1;
            }
        }
    }

    result
}

/// Send an XLM tip from `tipper` to a registered `creator`.
pub fn send_tip(
    env: &Env,
    tipper: &Address,
    creator: &Address,
    amount: i128,
    message: &String,
    is_anonymous: bool,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    tipper.require_auth();

    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    if tipper == creator {
        return Err(ContractError::CannotTipSelf);
    }

    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    let min_tip = storage::get_min_tip_amount(env);
    if amount < min_tip {
        return Err(ContractError::TipBelowMinimum);
    }

    if message.len() > 280 {
        return Err(ContractError::MessageTooLong);
    }

    let contract_address = env.current_contract_address();
    // Security: native SAC transfer has no callback path into this contract.
    token::transfer_xlm(env, tipper, &contract_address, amount)?;

    let mut profile = storage::get_profile(env, creator);
    profile.balance += amount;
    profile.total_tips_received += amount;
    profile.total_tips_count += 1;

    // Update credit score based on new tip totals
    profile.credit_score = credit::calculate_credit_score(&profile, env.ledger().timestamp());

    storage::set_profile(env, &profile);
    leaderboard::update_leaderboard(env, &profile);

    // Bump TTL for both Profile and UsernameToAddress together.
    storage::bump_profile_ttl(env, creator);
    storage::bump_username_ttl(env, &profile.username);

    let tip_id = store_tip(env, tipper, creator, amount, message.clone(), is_anonymous);
    storage::add_tipper_tip(env, tipper, tip_id);
    storage::add_creator_tip(env, creator, tip_id);
    let timestamp = env.ledger().timestamp();

    // Security: checked accumulation prevents silent i128 overflow.
    storage::add_to_tips_volume(env, amount)?;

    // Update 24h stats
    crate::stats::update_24h_stats(env, amount);
    crate::stats::mark_creator_active(env, creator);

    emit_tip_sent(env, tip_id, tipper, creator, amount, message, timestamp, is_anonymous);

    Ok(())
}

/// Withdraw accumulated tips from the caller's profile balance.
///
/// The withdrawal amount is split into a protocol fee (sent to the fee
/// collector) and the net amount (sent to the creator). The fee is calculated
/// using the current `fee_bps` setting.
///
/// # Parameters
/// - `caller` – the creator withdrawing their tips (must be registered)
/// - `amount` – the gross withdrawal amount in stroops (must be > 0 and ≤ balance)
///
/// # Errors
/// - [`ContractError::NotRegistered`] if `caller` has no profile
/// - [`ContractError::InvalidAmount`] if `amount` is ≤ 0
/// - [`ContractError::InsufficientBalance`] if `amount` > profile balance or contract lacks XLM
pub fn withdraw_tips(env: &Env, caller: &Address, amount: i128) -> Result<(), ContractError> {
    crate::admin::require_not_paused(env)?;
    caller.require_auth();

    if !storage::has_profile(env, caller) {
        return Err(ContractError::NotRegistered);
    }

    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    let mut profile = storage::get_profile(env, caller);

    if profile.balance < amount {
        return Err(ContractError::InsufficientBalance);
    }

    // Calculate fee and net amount
    let fee_bps = storage::get_fee_bps(env);
    // Security: fee path is mandatory for all withdrawals (no fee bypass branch).
    let (fee, net) = crate::fees::calculate_fee(amount, fee_bps)?;

    let contract_address = env.current_contract_address();
    let fee_collector = storage::get_fee_collector(env);

    // Transfer net amount to creator
    token::transfer_xlm(env, &contract_address, caller, net)?;

    // Transfer fee to collector (if fee > 0)
    if fee > 0 {
        token::transfer_xlm(env, &contract_address, &fee_collector, fee)?;
    }

    // Update profile balance
    profile.balance -= amount;
    storage::set_profile(env, &profile);

    // Bump TTL for both Profile and UsernameToAddress together.
    storage::bump_profile_ttl(env, caller);
    storage::bump_username_ttl(env, &profile.username);

    // Update global fees counter
    if fee > 0 {
        storage::add_to_fees(env, fee)?;
    }

    // Emit withdrawal event: (creator, net, fee)
    crate::events::emit_tips_withdrawn(env, caller, net, fee);

    Ok(())
}
