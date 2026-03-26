//! Withdrawal functionality for the Tipz contract.
//!
//! Handles creator withdrawals with fee deduction and token transfers.

use soroban_sdk::{token, Address, Env};

use crate::errors::ContractError;
use crate::events;
use crate::storage::{get_fee_bps, get_fee_collector, get_native_token, get_profile, has_profile, set_profile};
use crate::token as xlm;

/// Withdraws accumulated tips for a creator, deducting the configured fee.
///
/// The fee is calculated as `amount * fee_bps / 10000` and sent to the fee collector.
/// The remaining amount is transferred to the creator's address.
///
/// # Arguments
/// * `env` - The contract environment
/// * `caller` - The creator requesting withdrawal
/// * `amount` - The amount to withdraw in stroops
///
/// # Returns
/// `Ok(())` on success, or an error if validation fails
///
/// # Errors
/// * `NotInitialized` - Contract not initialized
/// * `NotRegistered` - Caller is not a registered creator
/// * `InvalidAmount` - Amount is zero or negative
/// * `InsufficientBalance` - Creator has insufficient balance
pub fn withdraw_tips(env: &Env, caller: &Address, amount: i128) -> Result<(), ContractError> {
    // Validate contract is initialized
    if !crate::storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }

    // Validate caller is registered
    if !has_profile(env, caller) {
        return Err(ContractError::NotRegistered);
    }

    // Validate amount
    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    let mut profile = get_profile(env, caller);

    // Check sufficient balance
    if profile.balance < amount {
        return Err(ContractError::InsufficientBalance);
    }

    // Calculate fee
    let fee_bps = get_fee_bps(env);
    let fee = (amount * fee_bps as i128) / 10000;
    let net_amount = amount - fee;

    // Update profile balance
    profile.balance -= amount;
    set_profile(env, &profile);

    // Get token client
    let sac_address = get_native_token(env);
    let token_client = token::TokenClient::new(env, &sac_address);

    // Transfer net amount to creator
    xlm::transfer_xlm(env, &env.current_contract_address(), caller, net_amount)?;

    // Transfer fee to fee collector
    if fee > 0 {
        let fee_collector = get_fee_collector(env);
        xlm::transfer_xlm(env, &env.current_contract_address(), &fee_collector, fee)?;
    }

    // Update total fees collected
    crate::storage::add_to_fees(env, fee);

    // Emit withdrawal event
    events::emit_tips_withdrawn(env, caller, amount, fee);

    Ok(())
}