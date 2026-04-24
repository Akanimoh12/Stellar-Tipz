//! Tests for contract versioning and upgrade mechanism.
//!
//! Note: Full upgrade testing requires a compiled WASM binary which may not
//! be available in all test environments. The upgrade-related tests are
//! conditionally compiled.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

use crate::errors::ContractError;
use crate::storage::DataKey;
use crate::TipzContract;
use crate::TipzContractClient;
use crate::CONTRACT_VERSION;

// ── shared setup ─────────────────────────────────────────────────────────────

#[allow(dead_code)]
struct TestCtx<'a> {
    env: Env,
    client: TipzContractClient<'a>,
    admin: Address,
}

fn setup() -> TestCtx<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let native_token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();

    client.initialize(&admin, &fee_collector, &200_u32, &native_token);

    TestCtx { env, client, admin }
}

// ── get_version ──────────────────────────────────────────────────────────────

#[test]
fn test_get_version_matches_constant_after_initialize() {
    let ctx = setup();
    let version = ctx.client.get_version();
    assert_eq!(version, CONTRACT_VERSION);
}

#[test]
fn test_get_version_returns_contract_version_constant() {
    let ctx = setup();
    let version = ctx.client.get_version();
    assert_eq!(version, CONTRACT_VERSION);
}

#[test]
fn test_get_version_returns_0_before_initialize() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let version = client.get_version();
    assert_eq!(version, 0);
}

// ── version storage ──────────────────────────────────────────────────────────

#[test]
fn test_initialize_stores_version_in_storage() {
    let ctx = setup();

    let stored: u32 = ctx.env.as_contract(&ctx.client.address, || {
        ctx.env
            .storage()
            .instance()
            .get(&DataKey::ContractVersion)
            .unwrap()
    });
    assert_eq!(stored, CONTRACT_VERSION);
}

#[test]
fn test_version_matches_stored_value() {
    let ctx = setup();

    // Read via client
    let version = ctx.client.get_version();

    // Read via storage directly
    let stored: u32 = ctx.env.as_contract(&ctx.client.address, || {
        ctx.env
            .storage()
            .instance()
            .get(&DataKey::ContractVersion)
            .unwrap()
    });

    assert_eq!(version, stored);
}

// ── admin-only upgrade rejection ─────────────────────────────────────────────

/// Tests that upgrade() returns NotAuthorized when called by non-admin.
/// This test doesn't require a valid WASM binary - it should fail at the
/// admin authentication step before attempting WASM upload.
#[test]
fn test_upgrade_non_admin_returns_not_authorized() {
    let ctx = setup();
    let attacker = Address::generate(&ctx.env);

    // Use a dummy WASM hash - the function should fail at auth check first
    let dummy_wasm_hash = BytesN::<32>::from_array(&ctx.env, &[0u8; 32]);

    let result = ctx.client.try_upgrade(&attacker, &dummy_wasm_hash);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

/// Tests that version doesn't change when upgrade fails due to auth.
#[test]
fn test_non_admin_upgrade_does_not_change_version() {
    let ctx = setup();
    let attacker = Address::generate(&ctx.env);
    let dummy_wasm_hash = BytesN::<32>::from_array(&ctx.env, &[0u8; 32]);

    let _ = ctx.client.try_upgrade(&attacker, &dummy_wasm_hash);

    assert_eq!(ctx.client.get_version(), CONTRACT_VERSION);
}

// ── regression: contract version constant ────────────────────────────────────

#[test]
fn test_contract_version_constant_is_2() {
    assert_eq!(CONTRACT_VERSION, 2);
}
