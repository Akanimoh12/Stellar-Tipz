//! Price oracle interface for cross-token XLM normalisation (issue #1184).
//!
//! ## Design
//!
//! Ranking and leaderboard logic requires a common unit. Without prices, a
//! 1 000-unit tip in a worthless token outranks 10 XLM. This module defines an
//! oracle interface so an admin can register an on-chain price source per token.
//!
//! ## Staleness & safety
//!
//! Prices carry a `updated_at` timestamp. Any price older than
//! [`ORACLE_PRICE_MAX_AGE_SECS`] is rejected. When no oracle is configured, or
//! when the oracle reverts, or when the price is stale, the function returns
//! `None` and callers fall back to counting only the native asset toward
//! rankings. **Oracle failure must never block tipping**, only ranking.
//!
//! ## Admin flow
//!
//! ```text
//! admin → set_token_oracle(token, oracle_contract)
//!      → on tip: fetch_oracle_price(token) → cache → convert → leaderboard
//! ```

use soroban_sdk::{symbol_short, Address, Env};

use crate::errors::ContractError;
use crate::storage;
use crate::types::{OraclePrice, ORACLE_PRICE_MAX_AGE_SECS, ORACLE_PRICE_SCALE};

/// Register (or update) the oracle contract for `token`.
///
/// # Authorization
/// Requires admin signature.
pub fn set_token_oracle(
    env: &Env,
    admin: &Address,
    token: &Address,
    oracle: &Address,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, admin)?;
    storage::set_token_oracle_address(env, token, oracle);
    env.events().publish(
        (symbol_short!("oracle"), symbol_short!("set")),
        (token.clone(), oracle.clone()),
    );
    Ok(())
}

/// Remove the oracle for `token`, reverting to native-only ranking.
///
/// # Authorization
/// Requires admin signature.
pub fn remove_token_oracle(
    env: &Env,
    admin: &Address,
    token: &Address,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, admin)?;
    // Remove by setting a sentinel? Storage has no "remove" for instance easily,
    // so we overwrite with a known sentinel that get_token_oracle_address returns None for.
    // The cleanest approach: delete the key.  Instance storage supports `remove`.
    env.storage()
        .instance()
        .remove(&crate::storage::ExtendedDataKey::TokenOracleAddress(token.clone()));
    env.events().publish(
        (symbol_short!("oracle"), symbol_short!("removed")),
        token.clone(),
    );
    Ok(())
}

/// Query the oracle contract for `token`'s current price.
///
/// Returns `Some(price)` when the oracle responds with a fresh price
/// (`updated_at` within [`ORACLE_PRICE_MAX_AGE_SECS`]).
/// Returns `None` on any failure (stale price, oracle revert, not configured).
pub fn fetch_oracle_price(env: &Env, token: &Address) -> Option<OraclePrice> {
    let oracle_addr = storage::get_token_oracle_address(env, token)?;
    let now = env.ledger().timestamp();

    // Invoke the oracle contract via a try_invoke to prevent oracle reverts from
    // propagating to the caller.
    let result: Result<OraclePrice, _> = env.try_invoke_contract(
        &oracle_addr,
        &soroban_sdk::Symbol::new(env, "get_price"),
        soroban_sdk::vec![env, token.to_val()],
    );

    match result {
        Ok(price) => {
            // Reject stale prices.
            if now.saturating_sub(price.updated_at) > ORACLE_PRICE_MAX_AGE_SECS {
                return None;
            }
            // Cache the fresh price so ranking reads don't need another RPC hop.
            storage::set_token_oracle_price(env, token, &price);
            Some(price)
        }
        Err(_) => {
            // Oracle reverted — degrade gracefully, do not block tipping.
            None
        }
    }
}

/// Convert `amount` stroops of `token` to an XLM-equivalent amount for ranking.
///
/// Priority:
/// 1. Live oracle price (via `fetch_oracle_price`).
/// 2. Last cached oracle price if still within staleness window.
/// 3. Falls back to `0` (token excluded from ranking) when no oracle is
///    configured — only the native asset counts (safe default).
///
/// The native token always converts 1:1 (the caller should pass through the
/// amount unchanged for native XLM rather than routing through this function).
pub fn convert_to_xlm_equivalent(env: &Env, token: &Address, amount: i128) -> i128 {
    // If no oracle is configured for this token, exclude it from ranking.
    if storage::get_token_oracle_address(env, token).is_none() {
        return 0;
    }

    // Try live oracle first.
    if let Some(price) = fetch_oracle_price(env, token) {
        return apply_price(amount, &price);
    }

    // Fall back to cached price if still within the staleness window.
    if let Some(cached) = storage::get_token_oracle_price(env, token) {
        let now = env.ledger().timestamp();
        if now.saturating_sub(cached.updated_at) <= ORACLE_PRICE_MAX_AGE_SECS {
            return apply_price(amount, &cached);
        }
    }

    // No usable price — exclude from ranking.
    0
}

/// Apply a price quote: `amount * price_scaled / ORACLE_PRICE_SCALE`.
fn apply_price(amount: i128, price: &OraclePrice) -> i128 {
    // Use u128 arithmetic to avoid overflow before dividing.
    let numerator = (amount as u128).saturating_mul(price.price_scaled as u128);
    (numerator / ORACLE_PRICE_SCALE as u128) as i128
}
