//! Unit tests for versioned storage migration framework (#1173).

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::errors::ContractError;
use crate::TipzContract;
use crate::TipzContractClient;
use crate::CONTRACT_VERSION;

struct TestCtx<'a> {
    env: Env,
    client: TipzContractClient<'a>,
    admin: Address,
}

fn setup() -> TestCtx<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.budget().reset_unlimited();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let native_token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    client.initialize(&admin, &fee_collector, &200_u32, &native_token);

    TestCtx { env, client, admin }
}

#[test]
fn test_migrate_same_version_is_noop() {
    let ctx = setup();
    let initial_version = ctx.client.get_version();
    assert_eq!(initial_version, CONTRACT_VERSION);

    let state = ctx.client.migrate(&ctx.admin, &CONTRACT_VERSION, &10);
    assert!(state.is_completed);
    assert_eq!(ctx.client.get_version(), CONTRACT_VERSION);
}

#[test]
fn test_migrate_downgrade_rejected() {
    let ctx = setup();
    let lower_version = CONTRACT_VERSION - 1;

    let res = ctx.client.try_migrate(&ctx.admin, &lower_version, &10);
    assert_eq!(res, Err(Ok(ContractError::MigrationDowngradeRejected)));
}

#[test]
fn test_migrate_upgrade_happy_path_and_resumption() {
    let ctx = setup();
    let target = CONTRACT_VERSION + 1;

    // First batch run (batch_size 2)
    let state1 = ctx.client.migrate(&ctx.admin, &target, &2);
    assert_eq!(state1.target_version, target);

    // Resume migration until completion
    let state2 = ctx.client.migrate(&ctx.admin, &target, &10);
    assert!(state2.is_completed);
    assert_eq!(ctx.client.get_version(), target);

    // Double-run is a no-op once completed
    let state3 = ctx.client.migrate(&ctx.admin, &target, &10);
    assert!(state3.is_completed);
}
