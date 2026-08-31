//! Multi-token support for tipping with vetted Stellar assets.
//!
//! Extends the tipping system to accept non-native assets (USDC, yXLM, etc.)
//! in addition to native XLM, with on-chain price conversion for leaderboard ranking.
//!
//! ## Allowlist (issue #1182)
//!
//! A token contract is arbitrary code: it can report fake balances, run hooks
//! inside `transfer`, or burn the caller's whole budget. Every token therefore
//! has to be vetted by the admin before it can be tipped:
//!
//! - [`add_accepted_token`] is admin-only and probes the token contract for its
//!   `decimals` and `symbol`, snapshotting both. A contract that cannot answer
//!   those SEP-41 calls is rejected outright, and a later malicious upgrade of
//!   the token cannot retroactively change how existing balances are read.
//! - [`send_tip_token`] rejects any token that is not currently enabled, and it
//!   does so **before** making any call into the token contract.
//! - [`remove_accepted_token`] disables a token for new tips but deliberately
//!   keeps its entry and every accrued balance intact.
//!
//! ## Removal must never strand funds
//!
//! [`withdraw_token`] intentionally performs **no** allowlist check, and
//! [`get_token_balances`] walks the full token list rather than only the
//! enabled ones. A creator who was tipped in a token that is later delisted can
//! always still see and withdraw that balance. Tests pin this behaviour; do not
//! "tidy up" by adding an `is_token_accepted` guard to the withdraw path.

use soroban_sdk::{token, Address, Env, String, Vec};

use crate::credit;
use crate::errors::ContractError;
use crate::events;
use crate::goals;
use crate::leaderboard;
use crate::storage;
use crate::types::AcceptedToken;
use crate::validation::{validate_message, validate_tip_for_creator};

/// Add a token to the allowlist of accepted tokens (admin only).
///
/// Probes the token contract for its `decimals` and `symbol` and stores both
/// alongside the entry. The probe doubles as a vetting step: an address that is
/// not a working SEP-41 token contract cannot answer, and the call is rejected
/// with [`ContractError::InvalidToken`] instead of being admitted.
///
/// Re-adding a token that was previously removed re-enables it and refreshes
/// the recorded metadata; `added_at` is set to the time of this admission,
/// since re-adding is a fresh vetting decision.
pub fn add_accepted_token(
    env: &Env,
    admin: &Address,
    token: &Address,
    oracle: Option<Address>,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, admin)?;

    // Never allow the contract itself onto the allowlist: tipping it would let
    // the contract's own balance be counted as a creator balance.
    if token == &env.current_contract_address() {
        return Err(ContractError::InvalidToken);
    }

    // Probe the token contract. `try_*` keeps a hostile or non-token contract
    // from trapping the whole invocation - it fails the add instead.
    let token_client = token::TokenClient::new(env, token);
    let decimals = token_client
        .try_decimals()
        .map_err(|_| ContractError::InvalidToken)?
        .map_err(|_| ContractError::InvalidToken)?;
    let symbol = token_client
        .try_symbol()
        .map_err(|_| ContractError::InvalidToken)?
        .map_err(|_| ContractError::InvalidToken)?;

    let accepted_token = AcceptedToken {
        token_address: token.clone(),
        oracle_address: oracle.clone(),
        enabled: true,
        added_at: env.ledger().timestamp(),
        decimals,
        symbol,
    };

    storage::set_accepted_token(env, token, &accepted_token);

    let mut token_list = storage::get_accepted_token_list(env);
    if !token_list.contains(token) {
        token_list.push_back(token.clone());
        storage::set_accepted_token_list(env, &token_list);
    }

    events::emit_token_added(env, token, &oracle);

    crate::admin::log_admin_action(
        env,
        admin,
        soroban_sdk::Symbol::new(env, "add_accepted_token"),
        soroban_sdk::String::from_str(env, ""),
        soroban_sdk::String::from_str(env, "added"),
    );

    Ok(())
}

/// Remove a token from the allowlist (admin only).
///
/// Disables the token for **new** tips only. The entry and every accrued
/// creator balance are deliberately left in place so delisting can never
/// strand funds — see [`withdraw_token`] and [`get_token_balances`].
///
/// Returns [`ContractError::TokenNotAccepted`] if the token was never added, so
/// a typo'd address is reported rather than silently "succeeding".
pub fn remove_accepted_token(
    env: &Env,
    admin: &Address,
    token: &Address,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, admin)?;

    let mut config =
        storage::get_accepted_token(env, token).ok_or(ContractError::TokenNotAccepted)?;
    config.enabled = false;
    // Retained, not deleted: existing balances stay withdrawable.
    storage::set_accepted_token(env, token, &config);

    events::emit_token_removed(env, token);

    crate::admin::log_admin_action(
        env,
        admin,
        soroban_sdk::Symbol::new(env, "remove_accepted_token"),
        soroban_sdk::String::from_str(env, "enabled"),
        soroban_sdk::String::from_str(env, "disabled"),
    );

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
    if storage::is_paused(env, crate::types::PauseFlag::Tips)
        || storage::is_paused(env, crate::types::PauseFlag::All)
    {
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

    // Set reentrancy guard before external token call
    storage::set_reentrancy_guard(env, true);
    // Transfer tokens from tipper to contract
    let token_client = token::TokenClient::new(env, token);
    if token_client.balance(tipper) < amount {
        storage::set_reentrancy_guard(env, false);
        return Err(ContractError::InsufficientBalance);
    }
    token_client.transfer(tipper, &contract_address, &amount);
    // Clear reentrancy guard after the transfer completes
    storage::set_reentrancy_guard(env, false);

    // Update creator's token balance
    storage::add_token_balance(env, creator, token, amount)?;

    // Convert to XLM equivalent for stats and leaderboard
    let xlm_equivalent = convert_to_xlm_equivalent(env, token, amount);

    // Saturating: a creator's lifetime total must never overflow (issue #042).
    profile.total_tips_received = profile.total_tips_received.saturating_add(xlm_equivalent);
    profile.total_tips_count += 1;

    // Update credit score based on new tip totals
    profile.credit_score =
        credit::calculate_credit_score_with_streak(env, &profile, env.ledger().timestamp());

    storage::set_profile(env, &profile);
    credit::mark_credit_computed(env, creator);
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
        tip_state.tips_last_24h = tip_state.tips_last_24h.saturating_add(1);
        tip_state.volume_last_24h = tip_state.volume_last_24h.saturating_add(xlm_equivalent);
    }

    storage::apply_send_tip_state(env, &tip_state);
    storage::set_creator_last_active(env, creator, now);

    events::emit_tip_sent_token(env, tip_id, tipper, creator, amount, token, message, now);

    Ok(())
}

/// Withdraw accumulated tips in a specific token.
///
/// **Deliberately does not check the allowlist.** A creator who was tipped in a
/// token that the admin later delisted must still be able to withdraw that
/// balance — removing a token blocks new tips, never withdrawals (issue #1182).
/// Adding an `is_token_accepted` guard here would strand funds.
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

    let balance = storage::get_token_balance(env, caller, token);
    let amount = crate::validation::validate_withdrawal_amount(
        amount,
        storage::get_min_withdrawal_amount(env),
        balance,
    )?;

    // Calculate fee and net amount
    let fee_bps = storage::get_fee_bps(env);
    let (fee, net) = crate::fees::calculate_fee(amount, fee_bps)?;

    let contract_address = env.current_contract_address();
    let fee_collector = storage::get_fee_collector(env);

    let token_client = token::TokenClient::new(env, token);

    // Set reentrancy guard before external token calls
    storage::set_reentrancy_guard(env, true);
    // Transfer net amount to creator
    token_client.transfer(&contract_address, caller, &net);
    // Clear reentrancy guard after first transfer
    storage::set_reentrancy_guard(env, false);

    // Transfer fee to collector (if fee > 0)
    if fee > 0 {
        storage::set_reentrancy_guard(env, true);
        token_client.transfer(&contract_address, &fee_collector, &fee);
        // Clear reentrancy guard after second transfer
        storage::set_reentrancy_guard(env, false);
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

/// Get all token balances for a creator.
///
/// Walks the full token list rather than only the enabled tokens, so balances
/// in delisted tokens stay visible and therefore withdrawable (issue #1182).
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
