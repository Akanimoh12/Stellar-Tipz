//! Multi-token support for tipping with any Stellar asset.
//!
//! Extends the tipping system to accept any Stellar asset (USDC, yXLM, etc.)
//! in addition to native XLM, with on-chain price conversion for leaderboard ranking.

use soroban_sdk::{token, Address, Env, String, Vec};

use crate::credit;
use crate::errors::ContractError;
use crate::events;
use crate::goals;
use crate::leaderboard;
use crate::storage;
use crate::types::{AcceptedToken, Tip};
use crate::validation::{validate_message, validate_tip_for_creator};

/// Add a token to the whitelist of accepted tokens (admin only)
pub fn add_accepted_token(
    env: &Env,
    admin: &Address,
    token: &Address,
    oracle: Option<Address>,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, admin)?;

    let accepted_token = AcceptedToken {
        token_address: token.clone(),
        oracle_address: oracle.clone(),
        enabled: true,
        added_at: env.ledger().timestamp(),
    };

    storage::set_accepted_token(env, token, &accepted_token);

    let mut token_list = storage::get_accepted_token_list(env);
    if !token_list.contains(token) {
        token_list.push_back(token.clone());
        storage::set_accepted_token_list(env, &token_list);
    }

    events::emit_token_added(env, token, &oracle);

    Ok(())
}

/// Remove a token from the whitelist (admin only)
pub fn remove_accepted_token(
    env: &Env,
    admin: &Address,
    token: &Address,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, admin)?;

    if let Some(mut config) = storage::get_accepted_token(env, token) {
        config.enabled = false;
        storage::set_accepted_token(env, token, &config);
    }

    events::emit_token_removed(env, token);

    Ok(())
}

/// Get list of all accepted tokens
pub fn get_accepted_tokens(env: &Env) -> Vec<AcceptedToken> {
    let token_list = storage::get_accepted_token_list(env);
    let mut result = Vec::new(env);

    for token in token_list.iter() {
        if let Some(config) = storage::get_accepted_token(env, &token) {
            if config.enabled {
                result.push_back(config);
            }
        }
    }

    result
}

/// Check if a token is accepted
pub fn is_token_accepted(env: &Env, token: &Address) -> bool {
    if let Some(config) = storage::get_accepted_token(env, token) {
        return config.enabled;
    }
    false
}

/// Convert token amount to XLM equivalent for leaderboard ranking.
///
/// When the token config carries no `oracle_address` the admin has explicitly
/// accepted a 1:1 ratio, which is appropriate for XLM-pegged or stable-value
/// assets.
///
/// When `oracle_address` is `Some`, live on-chain price queries are not yet
/// wired in — the field is reserved for a future upgrade. Until that work lands,
/// all tokens fall back to 1:1. Operators that need accurate cross-token
/// leaderboard ordering should withhold oracle-backed tokens from the whitelist
/// until oracle support is added. The `oracle_address` field on `AcceptedToken`
/// already captures which tokens will benefit from real pricing once the
/// integration is complete (see PR #745).
fn convert_to_xlm_equivalent(_env: &Env, _token: &Address, amount: i128) -> i128 {
    amount
}

/// Send a tip using a specific token
pub fn send_tip_token(
    env: &Env,
    tipper: &Address,
    creator: &Address,
    amount: i128,
    token: &Address,
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

    // Check if token is whitelisted
    if !is_token_accepted(env, token) {
        return Err(ContractError::TokenNotAccepted);
    }

    validate_tip_for_creator(env, creator, amount)?;
    validate_message(message)?;

    let contract_address = env.current_contract_address();
    
    // Transfer tokens from tipper to contract
    let token_client = token::TokenClient::new(env, token);
    if token_client.balance(tipper) < amount {
        return Err(ContractError::InsufficientBalance);
    }
    token_client.transfer(tipper, &contract_address, &amount);

    // Update creator's token balance
    storage::add_token_balance(env, creator, token, amount)?;

    // Convert to XLM equivalent for stats and leaderboard
    let xlm_equivalent = convert_to_xlm_equivalent(env, token, amount);

    profile.total_tips_received += xlm_equivalent;
    profile.total_tips_count += 1;

    // Update credit score based on new tip totals
    profile.credit_score =
        credit::calculate_credit_score_with_streak(env, &profile, env.ledger().timestamp());

    storage::set_profile(env, &profile);
    leaderboard::update_all_leaderboards_for_active(env, &profile, xlm_equivalent);

    // Update goal progress
    goals::update_goal_progress(env, creator, xlm_equivalent);

    // Bump TTL for both Profile and UsernameToAddress together.
    storage::bump_existing_profile_ttl(env, creator);
    storage::bump_username_ttl(env, &profile.username);

    let mut tip_state = storage::get_or_build_send_tip_state(env);
    let tip_id = tip_state.tip_count;
    tip_state.tip_count += 1;
    tip_state.total_tips_volume = tip_state
        .total_tips_volume
        .checked_add(xlm_equivalent)
        .ok_or(ContractError::OverflowError)?;

    let now = env.ledger().timestamp();
    if now - tip_state.stats_window_start > 86400 {
        tip_state.stats_window_start = now;
        tip_state.tips_last_24h = 1;
        tip_state.volume_last_24h = xlm_equivalent;
    } else {
        tip_state.tips_last_24h += 1;
        tip_state.volume_last_24h += xlm_equivalent;
    }

    storage::apply_send_tip_state(env, &tip_state);
    storage::set_creator_last_active(env, creator, now);

    events::emit_tip_sent_token(
        env,
        tip_id,
        tipper,
        creator,
        amount,
        token,
        message,
        now,
    );

    Ok(())
}

/// Withdraw accumulated tips in a specific token
pub fn withdraw_token(
    env: &Env,
    caller: &Address,
    token: &Address,
    amount: i128,
) -> Result<(), ContractError> {
    crate::admin::require_not_paused(env)?;
    caller.require_auth();

    if !storage::has_profile(env, caller) {
        return Err(ContractError::NotRegistered);
    }

    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    let balance = storage::get_token_balance(env, caller, token);
    if balance < amount {
        return Err(ContractError::InsufficientBalance);
    }

    // Calculate fee and net amount
    let fee_bps = storage::get_fee_bps(env);
    let (fee, net) = crate::fees::calculate_fee(amount, fee_bps)?;

    let contract_address = env.current_contract_address();
    let fee_collector = storage::get_fee_collector(env);

    let token_client = token::TokenClient::new(env, token);

    // Transfer net amount to creator
    token_client.transfer(&contract_address, caller, &net);

    // Transfer fee to collector (if fee > 0)
    if fee > 0 {
        token_client.transfer(&contract_address, &fee_collector, &fee);
    }

    // Update token balance
    let new_balance = balance - amount;
    storage::set_token_balance(env, caller, token, new_balance);

    storage::bump_profile_ttl(env, caller);

    // Update global fees counter (converted to XLM equivalent)
    if fee > 0 {
        let xlm_fee = convert_to_xlm_equivalent(env, token, fee);
        storage::add_to_fees(env, xlm_fee)?;
    }

    events::emit_tips_withdrawn(env, caller, net, fee);

    // Emit fee collection event for token withdrawal
    events::emit_fee_collected(env, "token_withdrawal", caller, amount, fee, net, fee_bps);

    Ok(())
}

/// Get all token balances for a creator
pub fn get_token_balances(env: &Env, creator: &Address) -> Vec<crate::types::TokenBalance> {
    let token_list = storage::get_accepted_token_list(env);
    let mut result = Vec::new(env);

    for token in token_list.iter() {
        let balance = storage::get_token_balance(env, creator, &token);
        if balance > 0 {
            result.push_back(crate::types::TokenBalance {
                token_address: token,
                amount: balance,
            });
        }
    }

    result
}
