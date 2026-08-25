//! Unit tests for two-step admin transfer enforcement (#1179).

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

use crate::admin::ADMIN_PROPOSAL_EXPIRY_SECS;
use crate::errors::ContractError;
use crate::TipzContract;
use crate::TipzContractClient;

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
fn test_single_step_set_admin_rejected() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);

    // Direct single-step set_admin MUST be rejected
    let res = ctx.client.try_set_admin(&ctx.admin, &new_admin);
    assert_eq!(res, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_two_step_admin_transfer_happy_path() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);

    ctx.client.propose_admin_change(&ctx.admin, &new_admin);
    assert!(ctx.client.get_admin_change_proposal().is_some());

    // Advance timelock 48 hours
    ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 172_801);

    ctx.client.confirm_admin_change(&new_admin);
    assert_eq!(ctx.client.get_admin_change_proposal(), None);
}

#[test]
fn test_confirm_by_wrong_address_fails() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);
    let impostor = Address::generate(&ctx.env);

    ctx.client.propose_admin_change(&ctx.admin, &new_admin);

    ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 172_801);

    let res = ctx.client.try_confirm_admin_change(&impostor);
    assert_eq!(res, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_admin_proposal_expiry() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);

    ctx.client.propose_admin_change(&ctx.admin, &new_admin);

    // Advance timestamp past proposal expiry window (48h timelock + 7 days expiry + 1 sec)
    ctx.env.ledger().set_timestamp(ctx.env.ledger().timestamp() + 172_800 + ADMIN_PROPOSAL_EXPIRY_SECS + 1);

    let res = ctx.client.try_confirm_admin_change(&new_admin);
    assert_eq!(res, Err(Ok(ContractError::AdminProposalExpired)));
}

#[test]
fn test_cancel_admin_proposal() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);

    ctx.client.propose_admin_change(&ctx.admin, &new_admin);
    assert!(ctx.client.get_admin_change_proposal().is_some());

    ctx.client.cancel_admin_change(&ctx.admin);
    assert_eq!(ctx.client.get_admin_change_proposal(), None);
}
