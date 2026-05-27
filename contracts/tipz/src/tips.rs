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
use crate::streaks;
use crate::token;
use crate::types::{ScheduledTip, Tip};
use crate::validation::{validate_message, validate_tip_for_creator};

/// Create a new [`Tip`] record and store it in temporary storage.
pub fn store_tip(
    env: &Env,
    sender: &Address,
    benefactor: Option<Address>,
    creator: &Address,
    amount: i128,
    message: String,
    is_anonymous: bool,
) -> u32 {
    let tip_id = storage::increment_tip_count(env);
    store_tip_with_id(
        env,
        tip_id,
        sender,
        benefactor,
        creator,
        amount,
        message,
        is_anonymous,
    );
    tip_id
}

fn store_tip_with_id(
    env: &Env,
    tip_id: u32,
    sender: &Address,
    benefactor: Option<Address>,
    creator: &Address,
    amount: i128,
    message: String,
    is_anonymous: bool,
) {
    let key = DataKey::Tip(tip_id);
    let tip = Tip {
        id: tip_id,
        sender: sender.clone(),
        benefactor: if is_anonymous {
            None
        } else {
            benefactor.or(Some(sender.clone()))
        },
        creator: creator.clone(),
        amount,
        message,
        timestamp: env.ledger().timestamp(),
        is_anonymous,
    };

    env.storage().temporary().set(&key, &tip);
    storage::set_tip_ttl(env, &key);
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
    let config = storage::get_runtime_config(env).ok_or(ContractError::NotInitialized)?;
    if config.paused {
        return Err(ContractError::ContractPaused);
    }
    tipper.require_auth();
    crate::validation::check_rate_limit_with_config(
        env,
        tipper,
        &config.admin,
        &config.rate_limit,
    )?;

    let mut profile = storage::get_profile_opt(env, creator).ok_or(ContractError::NotRegistered)?;

    if tipper == creator {
        return Err(ContractError::CannotTipSelf);
    }

    if storage::is_profile_deactivated(env, creator) {
        return Err(ContractError::ProfileDeactivated);
    }

    validate_tip_for_creator(env, creator, amount)?;
    validate_message(message)?;

    let contract_address = env.current_contract_address();
    // Security: native SAC transfer has no callback path into this contract.
    token::transfer_xlm_with_token(env, &config.native_token, tipper, &contract_address, amount)?;

    profile.balance += amount;
    profile.total_tips_received += amount;
    profile.total_tips_count += 1;

    // Update streak tracking before recomputing the creator score.
    streaks::record_tip_streak(env, tipper, creator);

    // Update credit score based on new tip totals
    profile.credit_score =
        credit::calculate_credit_score_with_streak(env, &profile, env.ledger().timestamp());

    storage::set_profile(env, &profile);
    leaderboard::update_all_leaderboards_for_active(env, &profile, amount);

    // Update goal progress
    crate::goals::update_goal_progress(env, creator, amount);

    // Bump TTL for both Profile and UsernameToAddress together.
    storage::bump_existing_profile_ttl(env, creator);
    storage::bump_username_ttl(env, &profile.username);

    let mut tip_state = storage::get_or_build_send_tip_state(env);
    let tip_id = tip_state.tip_count;
    tip_state.tip_count += 1;
    tip_state.total_tips_volume = tip_state
        .total_tips_volume
        .checked_add(amount)
        .ok_or(ContractError::OverflowError)?;

    let now = env.ledger().timestamp();
    if now - tip_state.stats_window_start > 86400 {
        tip_state.stats_window_start = now;
        tip_state.tips_last_24h = 1;
        tip_state.volume_last_24h = amount;
    } else {
        tip_state.tips_last_24h += 1;
        tip_state.volume_last_24h += amount;
    }

    store_tip_with_id(
        env,
        tip_id,
        tipper,
        None,
        creator,
        amount,
        message.clone(),
        is_anonymous,
    );
    storage::add_tipper_tip(env, tipper, tip_id);
    storage::add_creator_tip(env, creator, tip_id);
    let timestamp = now;

    storage::apply_send_tip_state(env, &tip_state);
    storage::set_creator_last_active(env, creator, now);

    emit_tip_sent(
        env,
        tip_id,
        tipper,
        creator,
        amount,
        message,
        timestamp,
        is_anonymous,
    );

    Ok(())
}

/// Send a tip on behalf of someone else.
pub fn send_tip_on_behalf(
    env: &Env,
    sender: &Address,
    on_behalf_of: &Address,
    creator: &Address,
    amount: i128,
    message: &String,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    sender.require_auth();
    on_behalf_of.require_auth();
    crate::validation::check_rate_limit(env, sender)?;

    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    if storage::is_profile_deactivated(env, creator) {
        return Err(ContractError::ProfileDeactivated);
    }

    if sender == creator || on_behalf_of == creator {
        return Err(ContractError::CannotTipSelf);
    }

    validate_tip_for_creator(env, creator, amount)?;
    validate_message(message)?;

    let contract_address = env.current_contract_address();
    token::transfer_xlm(env, sender, &contract_address, amount)?;

    let mut profile = storage::get_profile(env, creator);
    profile.balance += amount;
    profile.total_tips_received += amount;
    profile.total_tips_count += 1;

    profile.credit_score = credit::calculate_credit_score(&profile, env.ledger().timestamp());

    storage::set_profile(env, &profile);
    leaderboard::update_all_leaderboards(env, &profile, amount);

    storage::bump_profile_ttl(env, creator);
    storage::bump_username_ttl(env, &profile.username);

    let tip_id = store_tip(
        env,
        sender,
        Some(on_behalf_of.clone()),
        creator,
        amount,
        message.clone(),
        false,
    );
    storage::add_tipper_tip(env, sender, tip_id);
    storage::add_tipper_tip(env, on_behalf_of, tip_id); // Also show in benefactor's history
    storage::add_creator_tip(env, creator, tip_id);
    let timestamp = env.ledger().timestamp();

    storage::add_to_tips_volume(env, amount)?;
    crate::stats::update_24h_stats(env, amount);
    crate::stats::mark_creator_active(env, creator);

    emit_tip_sent(
        env, tip_id, sender, creator, amount, message, timestamp, false,
    );

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

/// Schedule a tip for future delivery.
///
/// The tip amount is locked in the contract until the delivery time.
/// The sender can cancel the tip before delivery (with a cancellation fee).
///
/// # Parameters
/// - `sender` – the address scheduling the tip
/// - `creator` – the recipient creator address
/// - `amount` – the tip amount in stroops
/// - `message` – optional message for the tip
/// - `deliver_at` – timestamp when the tip should be delivered
///
/// # Errors
/// - [`ContractError::NotInitialized`] if contract not initialized
/// - [`ContractError::ContractPaused`] if contract is paused
/// - [`ContractError::NotRegistered`] if creator has no profile
/// - [`ContractError::ProfileDeactivated`] if creator profile is deactivated
/// - [`ContractError::CannotTipSelf`] if sender == creator
/// - [`ContractError::InvalidAmount`] if amount <= 0
/// - [`ContractError::InvalidInput`] if deliver_at is in the past
pub fn send_scheduled_tip(
    env: &Env,
    sender: &Address,
    creator: &Address,
    amount: i128,
    message: &String,
    deliver_at: u64,
) -> Result<u32, ContractError> {
    storage::extend_instance_ttl(env);
    let config = storage::get_runtime_config(env).ok_or(ContractError::NotInitialized)?;
    if config.paused {
        return Err(ContractError::ContractPaused);
    }
    sender.require_auth();
    crate::validation::check_rate_limit_with_config(
        env,
        sender,
        &config.admin,
        &config.rate_limit,
    )?;

    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    if storage::is_profile_deactivated(env, creator) {
        return Err(ContractError::ProfileDeactivated);
    }

    if sender == creator {
        return Err(ContractError::CannotTipSelf);
    }

    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    let now = env.ledger().timestamp();
    if deliver_at <= now {
        return Err(ContractError::InvalidInput);
    }

    validate_message(message)?;

    // Lock the funds in the contract
    let contract_address = env.current_contract_address();
    token::transfer_xlm_with_token(env, &config.native_token, sender, &contract_address, amount)?;

    // Create scheduled tip
    let scheduled_tip_id = storage::increment_scheduled_tip_count(env);
    let scheduled_tip = ScheduledTip {
        id: scheduled_tip_id,
        sender: sender.clone(),
        creator: creator.clone(),
        amount,
        message: message.clone(),
        deliver_at,
        delivered: false,
        delivered_at: None,
        cancelled: false,
        cancelled_at: None,
        created_at: now,
    };

    storage::set_scheduled_tip(env, scheduled_tip_id, &scheduled_tip);
    storage::add_sender_scheduled_tip(env, sender, scheduled_tip_id);
    storage::add_creator_scheduled_tip(env, creator, scheduled_tip_id);

    // Emit event
    crate::events::emit_scheduled_tip_created(
        env,
        scheduled_tip_id,
        sender,
        creator,
        amount,
        deliver_at,
    );

    Ok(scheduled_tip_id)
}

/// Deliver a scheduled tip at or after the scheduled time.
///
/// This can be called by anyone after the delivery time has passed.
/// The tip is transferred to the creator's balance.
///
/// # Parameters
/// - `scheduled_tip_id` – the ID of the scheduled tip to deliver
///
/// # Errors
/// - [`ContractError::NotFound`] if scheduled tip doesn't exist
/// - [`ContractError::InvalidInput`] if tip already delivered or cancelled
/// - [`ContractError::InvalidInput`] if delivery time hasn't passed yet
pub fn deliver_scheduled_tip(
    env: &Env,
    scheduled_tip_id: u32,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;

    let mut scheduled_tip = storage::get_scheduled_tip(env, scheduled_tip_id)
        .ok_or(ContractError::NotFound)?;

    if scheduled_tip.delivered {
        return Err(ContractError::InvalidInput);
    }

    if scheduled_tip.cancelled {
        return Err(ContractError::InvalidInput);
    }

    let now = env.ledger().timestamp();
    if now < scheduled_tip.deliver_at {
        return Err(ContractError::InvalidInput);
    }

    // Mark as delivered
    scheduled_tip.delivered = true;
    scheduled_tip.delivered_at = Some(now);
    storage::set_scheduled_tip(env, scheduled_tip_id, &scheduled_tip);

    // Update creator profile
    let mut profile = storage::get_profile(env, &scheduled_tip.creator);
    profile.balance += scheduled_tip.amount;
    profile.total_tips_received += scheduled_tip.amount;
    profile.total_tips_count += 1;

    // Update streak tracking
    streaks::record_tip_streak(env, &scheduled_tip.sender, &scheduled_tip.creator);

    // Update credit score
    profile.credit_score =
        credit::calculate_credit_score_with_streak(env, &profile, now);

    storage::set_profile(env, &profile);
    leaderboard::update_all_leaderboards_for_active(env, &profile, scheduled_tip.amount);

    // Update goal progress
    crate::goals::update_goal_progress(env, &scheduled_tip.creator, scheduled_tip.amount);

    // Bump TTL
    storage::bump_existing_profile_ttl(env, &scheduled_tip.creator);
    storage::bump_username_ttl(env, &profile.username);

    // Create a regular tip record
    let tip_id = store_tip(
        env,
        &scheduled_tip.sender,
        None,
        &scheduled_tip.creator,
        scheduled_tip.amount,
        scheduled_tip.message.clone(),
        false,
    );
    storage::add_tipper_tip(env, &scheduled_tip.sender, tip_id);
    storage::add_creator_tip(env, &scheduled_tip.creator, tip_id);

    // Update stats
    storage::add_to_tips_volume(env, scheduled_tip.amount)?;
    crate::stats::update_24h_stats(env, scheduled_tip.amount);
    crate::stats::mark_creator_active(env, &scheduled_tip.creator);

    // Emit tip sent event
    emit_tip_sent(
        env,
        tip_id,
        &scheduled_tip.sender,
        &scheduled_tip.creator,
        scheduled_tip.amount,
        &scheduled_tip.message,
        now,
        false,
    );

    // Emit scheduled tip delivered event
    crate::events::emit_scheduled_tip_delivered(env, scheduled_tip_id, &scheduled_tip.creator);

    Ok(())
}

/// Cancel a scheduled tip before delivery.
///
/// The sender can cancel the tip and receive a refund minus a cancellation fee.
///
/// # Parameters
/// - `scheduled_tip_id` – the ID of the scheduled tip to cancel
///
/// # Errors
/// - [`ContractError::NotFound`] if scheduled tip doesn't exist
/// - [`ContractError::InvalidInput`] if tip already delivered or cancelled
/// - [`ContractError::InvalidInput`] if delivery time has already passed
/// - [`ContractError::Unauthorized`] if caller is not the sender
pub fn cancel_scheduled_tip(
    env: &Env,
    caller: &Address,
    scheduled_tip_id: u32,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    caller.require_auth();

    let mut scheduled_tip = storage::get_scheduled_tip(env, scheduled_tip_id)
        .ok_or(ContractError::NotFound)?;

    if scheduled_tip.sender != *caller {
        return Err(ContractError::Unauthorized);
    }

    if scheduled_tip.delivered {
        return Err(ContractError::InvalidInput);
    }

    if scheduled_tip.cancelled {
        return Err(ContractError::InvalidInput);
    }

    let now = env.ledger().timestamp();
    if now >= scheduled_tip.deliver_at {
        return Err(ContractError::InvalidInput);
    }

    // Mark as cancelled
    scheduled_tip.cancelled = true;
    scheduled_tip.cancelled_at = Some(now);
    storage::set_scheduled_tip(env, scheduled_tip_id, &scheduled_tip);

    // Calculate refund with cancellation fee (1% fee)
    let cancellation_fee = scheduled_tip.amount / 100;
    let refund_amount = scheduled_tip.amount - cancellation_fee;

    // Refund the sender
    let contract_address = env.current_contract_address();
    token::transfer_xlm(env, &contract_address, &scheduled_tip.sender, refund_amount)?;

    // Send cancellation fee to fee collector
    if cancellation_fee > 0 {
        let fee_collector = storage::get_fee_collector(env);
        token::transfer_xlm(env, &contract_address, &fee_collector, cancellation_fee)?;
        storage::add_to_fees(env, cancellation_fee)?;
    }

    // Emit event
    crate::events::emit_scheduled_tip_cancelled(
        env,
        scheduled_tip_id,
        &scheduled_tip.sender,
        refund_amount,
        cancellation_fee,
    );

    Ok(())
}

/// Get a scheduled tip by ID.
pub fn get_scheduled_tip(env: &Env, scheduled_tip_id: u32) -> Option<ScheduledTip> {
    storage::get_scheduled_tip(env, scheduled_tip_id)
}

/// Get scheduled tips for a sender.
pub fn get_scheduled_tips_by_sender(
    env: &Env,
    sender: &Address,
    limit: u32,
    offset: u32,
) -> Vec<ScheduledTip> {
    let limit = if limit > MAX_PAGE_LIMIT {
        MAX_PAGE_LIMIT
    } else {
        limit
    };
    let ids = storage::get_sender_scheduled_tip_ids(env, sender);
    let mut result = Vec::new(env);
    let mut found = 0_u32;

    for (i, tip_id) in ids.iter().enumerate() {
        if (i as u32) < offset {
            continue;
        }
        if found >= limit {
            break;
        }
        if let Some(tip) = storage::get_scheduled_tip(env, tip_id) {
            result.push_back(tip);
            found += 1;
        }
    }

    result
}

/// Get scheduled tips for a creator.
pub fn get_scheduled_tips_by_creator(
    env: &Env,
    creator: &Address,
    limit: u32,
    offset: u32,
) -> Vec<ScheduledTip> {
    let limit = if limit > MAX_PAGE_LIMIT {
        MAX_PAGE_LIMIT
    } else {
        limit
    };
    let ids = storage::get_creator_scheduled_tip_ids(env, creator);
    let mut result = Vec::new(env);
    let mut found = 0_u32;

    for (i, tip_id) in ids.iter().enumerate() {
        if (i as u32) < offset {
            continue;
        }
        if found >= limit {
            break;
        }
        if let Some(tip) = storage::get_scheduled_tip(env, tip_id) {
            result.push_back(tip);
            found += 1;
        }
    }

    result
}
