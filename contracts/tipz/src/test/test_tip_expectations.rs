//! Pinned min-tip / fee expectations on `send_tip`.
//!
//! If config changes between the caller signing and the transaction landing,
//! a mismatch must abort with `ConfigMismatch` before any state change.
//! Omitting the optional params preserves prior behaviour.

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Events},
    token, Address, Env, String,
};

use crate::errors::ContractError;
use crate::TipzContract;
use crate::TipzContractClient;

struct TestCtx<'a> {
    env: Env,
    client: TipzContractClient<'a>,
    admin: Address,
    creator: Address,
    tipper: Address,
    native_token: Address,
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

    let sac_client = token::StellarAssetClient::new(&env, &native_token);
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

    TestCtx {
        env,
        client,
        admin,
        creator,
        tipper,
        native_token,
    }
}

fn tipper_balance(ctx: &TestCtx) -> i128 {
    token::TokenClient::new(&ctx.env, &ctx.native_token).balance(&ctx.tipper)
}

fn creator_balance(ctx: &TestCtx) -> i128 {
    ctx.client.get_profile(&ctx.creator).profile.balance
}

fn assert_tip_not_applied(ctx: &TestCtx, tipper_before: i128, events_before: u32) {
    assert_eq!(tipper_balance(ctx), tipper_before);
    assert_eq!(creator_balance(ctx), 0);
    assert_eq!(ctx.client.get_stats().total_tips_count, 0);
    assert_eq!(
        ctx.env.events().all().len(),
        events_before,
        "rejected tip must not emit events"
    );
}

#[test]
fn test_send_tip_matching_expectations() {
    let ctx = setup();
    let min_tip = ctx.client.get_min_tip_amount();
    let fee_bps = ctx.client.get_config().fee_bps;
    let amount = 10_000_000_i128;
    let msg = String::from_str(&ctx.env, "tip");

    ctx.client.send_tip(
        &ctx.tipper,
        &ctx.creator,
        &amount,
        &msg,
        &false,
        &false,
        &Some(min_tip),
        &Some(fee_bps),
    );

    assert_eq!(creator_balance(&ctx), amount);
    assert_eq!(ctx.client.get_stats().total_tips_count, 1);
}

#[test]
fn test_send_tip_mismatched_min_tip() {
    let ctx = setup();
    let original_min = ctx.client.get_min_tip_amount();
    let amount = 10_000_000_i128;
    let msg = String::from_str(&ctx.env, "tip");

    ctx.client
        .set_min_tip_amount(&ctx.admin, &(original_min + 1_000_000));

    let tipper_before = tipper_balance(&ctx);
    let events_before = ctx.env.events().all().len();

    let result = ctx.client.try_send_tip(
        &ctx.tipper,
        &ctx.creator,
        &amount,
        &msg,
        &false,
        &false,
        &Some(original_min),
        &None,
    );

    assert_eq!(result, Err(Ok(ContractError::ConfigMismatch)));
    assert_tip_not_applied(&ctx, tipper_before, events_before);
}

#[test]
fn test_send_tip_mismatched_fee_bps() {
    let ctx = setup();
    let original_fee = ctx.client.get_config().fee_bps;
    let amount = 10_000_000_i128;
    let msg = String::from_str(&ctx.env, "tip");

    // Fee decreases apply immediately, so the on-chain value diverges from
    // the fee the caller pinned at sign time.
    ctx.client.set_fee(&ctx.admin, &100_u32);
    assert_ne!(ctx.client.get_config().fee_bps, original_fee);

    let tipper_before = tipper_balance(&ctx);
    let events_before = ctx.env.events().all().len();

    let result = ctx.client.try_send_tip(
        &ctx.tipper,
        &ctx.creator,
        &amount,
        &msg,
        &false,
        &false,
        &None,
        &Some(original_fee),
    );

    assert_eq!(result, Err(Ok(ContractError::ConfigMismatch)));
    assert_tip_not_applied(&ctx, tipper_before, events_before);
}

#[test]
fn test_send_tip_omitted_expectations() {
    let ctx = setup();
    let amount = 10_000_000_i128;
    let msg = String::from_str(&ctx.env, "tip");

    ctx.client.send_tip(
        &ctx.tipper,
        &ctx.creator,
        &amount,
        &msg,
        &false,
        &false,
        &None,
        &None,
    );

    assert_eq!(creator_balance(&ctx), amount);
    assert_eq!(ctx.client.get_stats().total_tips_count, 1);
}
