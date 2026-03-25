//! Tip record storage and transfer logic for the Tipz contract.
//!
//! Tips are stored in temporary storage so they expire automatically after a
//! bounded lifetime, while aggregate counters remain in persistent contract
//! state.

use soroban_sdk::{Address, Env, String, Vec};

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
) -> u32 {
    let tip_id = storage::increment_tip_count(env);
    let key = DataKey::Tip(tip_id);
    let tip = Tip {
        id: tip_id,
        tipper: tipper.clone(),
        creator: creator.clone(),
        amount,
        message,
        timestamp: env.ledger().timestamp(),
    };

    env.storage().temporary().set(&key, &tip);
    storage::set_tip_ttl(env, &key);

    tip_id
}

/// Retrieve a single tip by its ID.
pub fn get_tip(env: &Env, tip_id: u32) -> Option<Tip> {
    env.storage().temporary().get(&DataKey::Tip(tip_id))
}

/// Return up to `count` recent tips received by `creator`, newest first.
pub fn get_recent_tips(env: &Env, creator: &Address, count: u32) -> Vec<Tip> {
    let tip_count = storage::get_tip_count(env);
    let mut result = Vec::new(env);
    let mut found = 0_u32;
    let mut index = tip_count;

    while index > 0 && found < count {
        index -= 1;
        if let Some(tip) = env
            .storage()
            .temporary()
            .get::<DataKey, Tip>(&DataKey::Tip(index))
        {
            if tip.creator == *creator {
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
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
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

    if message.len() > 280 {
        return Err(ContractError::MessageTooLong);
    }

    let contract_address = env.current_contract_address();
    token::transfer_xlm(env, tipper, &contract_address, amount)?;

    let mut profile = storage::get_profile(env, creator);
    profile.balance += amount;
    profile.total_tips_received += amount;
    profile.total_tips_count += 1;
    storage::set_profile(env, &profile);
    leaderboard::update_leaderboard(env, &profile);

    store_tip(env, tipper, creator, amount, message.clone());

    storage::add_to_tips_volume(env, amount);

    emit_tip_sent(env, tipper, creator, amount);

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

    // Update global fees counter
    if fee > 0 {
        storage::add_to_fees(env, fee);
    }

    // Emit withdrawal event
    crate::events::emit_tips_withdrawn(env, caller, amount, fee);

    Ok(())
}
