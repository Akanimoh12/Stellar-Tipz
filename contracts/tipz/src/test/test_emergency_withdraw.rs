#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

use crate::admin::EMERGENCY_WITHDRAWAL_DELAY_SECS;
use crate::errors::ContractError;
use crate::TipzContract;
use crate::TipzContractClient;

struct TestCtx<'a> {
    env: Env,
    client: TipzContractClient<'a>,
    admin: Address,
    creator: Address,
    tipper: Address,
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
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

    let sac_client = soroban_sdk::token::StellarAssetClient::new(&env, &native_token);
    sac_client.mint(&tipper, &100_000_000);

    client.initialize(&admin, &fee_collector, &200_u32, &native_token);

    client.register_profile(
        &creator,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, "bio"),
        &String::from_str(&env, "https://image.png"),
        &String::from_str(&env, "alice_x"),
    );

    // Fund contract & creator profile balance via send_tip
    let msg = String::from_str(&env, "tip");
    client.send_tip(&tipper, &creator, &10_000_000, &msg, &false, &false, &None, &None);

    TestCtx {
        env,
        client,
        admin,
        creator,
        tipper,
    }
}

#[test]
fn test_emergency_withdraw_fails_when_not_paused() {
    let ctx = setup();
    let res = ctx.client.try_emergency_withdraw_tips(&ctx.creator, &1_000_000);
    assert_eq!(res, Err(Ok(ContractError::ContractNotPaused)));
}

#[test]
fn test_emergency_withdraw_fails_before_delay_threshold() {
    let ctx = setup();
    ctx.client.pause(&ctx.admin);

    // Advance timestamp partially (3 days, less than 7 days threshold)
    ctx.env
        .ledger()
        .set_timestamp(ctx.env.ledger().timestamp() + 3 * 86_400);

    let res = ctx.client.try_emergency_withdraw_tips(&ctx.creator, &1_000_000);
    assert_eq!(res, Err(Ok(ContractError::EmergencyWithdrawalNotAllowed)));
}

#[test]
fn test_emergency_withdraw_succeeds_after_delay_threshold_even_if_paused() {
    let ctx = setup();
    ctx.client.pause(&ctx.admin);

    // Advance timestamp past 7-day delay threshold (7 days + 1 sec)
    ctx.env
        .ledger()
        .set_timestamp(ctx.env.ledger().timestamp() + EMERGENCY_WITHDRAWAL_DELAY_SECS + 1);

    // Emergency withdrawal must succeed while paused
    ctx.client.emergency_withdraw_tips(&ctx.creator, &4_800_000);

    let profile = ctx.client.get_profile(&ctx.creator);
    assert_eq!(profile.profile.balance, 5_000_000); // 9_800_000 original - 4_800_000 fee-free withdrawal
}
