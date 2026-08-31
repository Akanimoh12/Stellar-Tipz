//! Tests for the price oracle interface (issue #1184).
//!
//! Verifies:
//! - Fresh price converts correctly to XLM equivalent.
//! - Stale price is rejected (returns 0, not blocked tip).
//! - No oracle configured → token excluded from ranking (returns 0).
//! - Oracle revert degrades gracefully (returns 0, tip succeeds).
//! - Mock oracle supports tests.

#![cfg(test)]

use soroban_sdk::{
    contract, contractimpl,
    testutils::Address as _,
    Address, Env, String,
};

use crate::{
    oracle::{convert_to_xlm_equivalent, fetch_oracle_price, set_token_oracle},
    storage,
    types::{OraclePrice, ORACLE_PRICE_MAX_AGE_SECS, ORACLE_PRICE_SCALE},
    TipzContract,
};

// ── Mock oracle contract ──────────────────────────────────────────────────────

/// A simple mock oracle that returns a configurable price.
/// In tests, we pre-store the price in instance storage and the mock reads it.
#[contract]
pub struct MockOracle;

/// Storage key for the mock oracle's configured price.
#[soroban_sdk::contracttype]
pub enum MockOracleKey {
    Price,
    /// When set to true, the oracle panics (simulates a reverting oracle).
    ShouldRevert,
}

#[contractimpl]
impl MockOracle {
    /// Set the price this mock will return.
    pub fn set_price(env: Env, price: OraclePrice) {
        env.storage().instance().set(&MockOracleKey::Price, &price);
    }

    /// Configure the mock to panic on get_price (simulates a reverting oracle).
    pub fn set_should_revert(env: Env, should_revert: bool) {
        env.storage()
            .instance()
            .set(&MockOracleKey::ShouldRevert, &should_revert);
    }

    /// Oracle interface: return the price for `_token`.
    pub fn get_price(env: Env, _token: Address) -> OraclePrice {
        let should_revert: bool = env
            .storage()
            .instance()
            .get(&MockOracleKey::ShouldRevert)
            .unwrap_or(false);
        if should_revert {
            panic!("oracle revert");
        }
        env.storage()
            .instance()
            .get(&MockOracleKey::Price)
            .expect("price not configured")
    }
}

fn make_env() -> Env {
    Env::default()
}

fn register_tipz(env: &Env) -> Address {
    env.register_contract(None, TipzContract)
}

fn deploy_mock_oracle(env: &Env) -> Address {
    env.register_contract(None, MockOracle)
}

// ── No oracle configured → excluded from ranking ──────────────────────────────

#[test]
fn no_oracle_returns_zero() {
    let env = make_env();
    let contract_id = register_tipz(&env);
    let token = Address::generate(&env);

    env.as_contract(&contract_id, || {
        // No oracle registered for token.
        let result = convert_to_xlm_equivalent(&env, &token, 1_000_000);
        assert_eq!(result, 0, "unregistered token should contribute 0 to ranking");
    });
}

// ── Fresh price converts correctly ────────────────────────────────────────────

#[test]
fn fresh_price_converts_correctly() {
    let env = make_env();
    let contract_id = register_tipz(&env);
    let token = Address::generate(&env);
    let oracle_id = deploy_mock_oracle(&env);

    // 1 token stroop = 2 XLM stroops (price_scaled = 2 * ORACLE_PRICE_SCALE).
    let now = env.ledger().timestamp();
    let price = OraclePrice {
        price_scaled: 2 * ORACLE_PRICE_SCALE,
        updated_at: now,
    };
    env.as_contract(&oracle_id, || {
        MockOracle::set_price(env.clone(), price);
    });

    env.as_contract(&contract_id, || {
        set_token_oracle(&env, &Address::generate(&env), &token, &oracle_id)
            .expect("set oracle failed");
        // We bypass admin check in storage directly for the test.
        storage::set_token_oracle_address(&env, &token, &oracle_id);

        let result = convert_to_xlm_equivalent(&env, &token, 500_000);
        // 500_000 * 2 * SCALE / SCALE = 1_000_000
        assert_eq!(result, 1_000_000, "price should double the amount");
    });
}

// ── Stale price rejected ──────────────────────────────────────────────────────

#[test]
fn stale_price_rejected() {
    let env = make_env();
    let contract_id = register_tipz(&env);
    let token = Address::generate(&env);
    let oracle_id = deploy_mock_oracle(&env);

    // Price updated_at is far in the past (beyond ORACLE_PRICE_MAX_AGE_SECS).
    let now = env.ledger().timestamp();
    let stale_updated_at = now.saturating_sub(ORACLE_PRICE_MAX_AGE_SECS + 1);
    let price = OraclePrice {
        price_scaled: ORACLE_PRICE_SCALE,
        updated_at: stale_updated_at,
    };
    env.as_contract(&oracle_id, || {
        MockOracle::set_price(env.clone(), price);
    });

    env.as_contract(&contract_id, || {
        storage::set_token_oracle_address(&env, &token, &oracle_id);

        // fetch_oracle_price must reject the stale price.
        let result = fetch_oracle_price(&env, &token);
        assert!(result.is_none(), "stale price must be rejected by fetch_oracle_price");

        // convert must also return 0 when only stale price is available.
        let xlm = convert_to_xlm_equivalent(&env, &token, 1_000_000);
        assert_eq!(xlm, 0, "stale price must yield 0 XLM equivalent");
    });
}

// ── Oracle revert degrades gracefully ─────────────────────────────────────────

#[test]
fn oracle_revert_returns_zero_not_panic() {
    let env = make_env();
    let contract_id = register_tipz(&env);
    let token = Address::generate(&env);
    let oracle_id = deploy_mock_oracle(&env);

    env.as_contract(&oracle_id, || {
        MockOracle::set_should_revert(env.clone(), true);
    });

    env.as_contract(&contract_id, || {
        storage::set_token_oracle_address(&env, &token, &oracle_id);

        // A reverting oracle must not propagate the panic.
        let result = fetch_oracle_price(&env, &token);
        assert!(result.is_none(), "reverting oracle must return None");

        let xlm = convert_to_xlm_equivalent(&env, &token, 1_000_000);
        assert_eq!(xlm, 0, "reverting oracle must yield 0, not panic");
    });
}

// ── Cached price fallback within staleness window ────────────────────────────

#[test]
fn cached_price_used_when_oracle_unavailable() {
    let env = make_env();
    let contract_id = register_tipz(&env);
    let token = Address::generate(&env);
    let oracle_id = deploy_mock_oracle(&env);

    let now = env.ledger().timestamp();
    let price = OraclePrice {
        price_scaled: ORACLE_PRICE_SCALE, // 1:1
        updated_at: now,
    };

    env.as_contract(&contract_id, || {
        storage::set_token_oracle_address(&env, &token, &oracle_id);
        // Pre-populate the cache with a valid price.
        storage::set_token_oracle_price(&env, &token, &price);

        // Oracle is not responding (no price set in mock, would panic) — but
        // we set it to revert.
        env.as_contract(&oracle_id, || {
            MockOracle::set_should_revert(env.clone(), true);
        });

        // Should fall back to the cached price.
        let xlm = convert_to_xlm_equivalent(&env, &token, 500_000);
        assert_eq!(xlm, 500_000, "should use cached 1:1 price when oracle reverts");
    });
}
