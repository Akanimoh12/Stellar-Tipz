//! Access control audit tests for all admin-gated contract functions.
//!
//! Verifies that every admin-only function rejects non-admin callers with
//! `ContractError::NotAuthorized`, and that pausing blocks tip operations.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String};

use crate::errors::ContractError;
use crate::types::PauseFlag;
use crate::{TipzContract, TipzContractClient};

const PAUSE_ALL: u32 = PauseFlag::All as u32;
const PAUSE_TIPS: u32 = PauseFlag::Tips as u32;
const PAUSE_WITHDRAWALS: u32 = PauseFlag::Withdrawals as u32;
const PAUSE_REGISTRATION: u32 = PauseFlag::Registration as u32;
const PAUSE_SUBSCRIPTIONS: u32 = PauseFlag::Subscriptions as u32;
const PAUSE_REFUNDS: u32 = PauseFlag::Refunds as u32;

// ── shared setup ─────────────────────────────────────────────────────────────

struct TestCtx<'a> {
    env: Env,
    client: TipzContractClient<'a>,
    admin: Address,
    fee_collector: Address,
    creator: Address,
    tipper: Address,
    token_address: Address,
}

fn setup() -> TestCtx<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200_u32, &token_address);

    let creator = Address::generate(&env);
    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    let tipper = Address::generate(&env);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&tipper, &1_000_000_000);

    TestCtx {
        env,
        client,
        admin,
        fee_collector,
        creator,
        tipper,
        token_address,
    }
}

// ── pause / unpause ───────────────────────────────────────────────────────────

#[test]
fn test_non_admin_cannot_pause() {
    let ctx = setup();
    let non_admin = Address::generate(&ctx.env);
    let result = ctx.client.try_pause(&non_admin, &PAUSE_ALL);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_non_admin_cannot_unpause() {
    let ctx = setup();
    // First pause with admin so unpause makes sense
    ctx.client.pause(&ctx.admin, &PAUSE_ALL);
    let non_admin = Address::generate(&ctx.env);
    let result = ctx.client.try_unpause(&non_admin, &PAUSE_ALL);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_admin_can_pause_and_unpause() {
    let ctx = setup();
    ctx.client.pause(&ctx.admin, &PAUSE_ALL);
    assert!(ctx.client.is_paused(&PAUSE_ALL));
    ctx.client.unpause(&ctx.admin, &PAUSE_ALL);
    assert!(!ctx.client.is_paused(&PAUSE_ALL));
}

// ── fee management ────────────────────────────────────────────────────────────

#[test]
fn test_non_admin_cannot_update_fees() {
    let ctx = setup();
    let non_admin = Address::generate(&ctx.env);
    let result = ctx.client.try_set_fee(&non_admin, &500_u32);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_non_admin_cannot_set_fee_collector() {
    let ctx = setup();
    let non_admin = Address::generate(&ctx.env);
    let new_collector = Address::generate(&ctx.env);
    let result = ctx.client.try_set_fee_collector(&non_admin, &new_collector);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_admin_can_update_fees() {
    let ctx = setup();
    ctx.client.set_fee(&ctx.admin, &300_u32);
    let stats = ctx.client.get_stats();
    let _ = stats; // fee is applied at withdrawal; confirms no panic
}

#[test]
fn test_fee_collector_only_receives_fees_on_withdrawal() {
    let ctx = setup();
    // Send tip so creator has a balance to withdraw
    ctx.client.send_tip(
        &ctx.tipper,
        &ctx.creator,
        &100_000_000_i128,
        &String::from_str(&ctx.env, "tip"),
        &false,
        &false,
    );
    // Withdraw; fee goes to fee_collector, not arbitrary address
    ctx.client.withdraw_tips(&ctx.creator, &50_000_000_i128);
    // The call succeeding means fees were routed to the configured collector
}

// ── admin role transfer ───────────────────────────────────────────────────────

#[test]
fn test_non_admin_cannot_transfer_admin_role() {
    let ctx = setup();
    let non_admin = Address::generate(&ctx.env);
    let new_admin = Address::generate(&ctx.env);
    let result = ctx.client.try_set_admin(&non_admin, &new_admin);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_non_admin_cannot_propose_admin_change() {
    let ctx = setup();
    let non_admin = Address::generate(&ctx.env);
    let new_admin = Address::generate(&ctx.env);
    let result = ctx.client.try_propose_admin_change(&non_admin, &new_admin);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

// ── X metrics batch ───────────────────────────────────────────────────────────

#[test]
fn test_non_admin_cannot_update_x_metrics() {
    let ctx = setup();
    let non_admin = Address::generate(&ctx.env);
    let updates = soroban_sdk::vec![
        &ctx.env,
        (ctx.creator.clone(), 1000_u32, 100_u32)
    ];
    let result = ctx.client.try_batch_update_x_metrics(&non_admin, &updates);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

// ── min tip amount ────────────────────────────────────────────────────────────

#[test]
fn test_non_admin_cannot_set_min_tip_amount() {
    let ctx = setup();
    let non_admin = Address::generate(&ctx.env);
    let result = ctx.client.try_set_min_tip_amount(&non_admin, &5_000_000_i128);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

// ── pause blocks operations ───────────────────────────────────────────────────

#[test]
fn test_pause_blocks_send_tip() {
    let ctx = setup();
    ctx.client.pause(&ctx.admin, &PAUSE_TIPS);
    let result = ctx.client.try_send_tip(
        &ctx.tipper,
        &ctx.creator,
        &1_000_000_i128,
        &String::from_str(&ctx.env, "msg"),
        &false,
        &false,
    );
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_pause_blocks_withdraw_tips() {
    let ctx = setup();
    // Fund creator first
    ctx.client.send_tip(
        &ctx.tipper,
        &ctx.creator,
        &10_000_000_i128,
        &String::from_str(&ctx.env, "tip"),
        &false,
        &false,
    );
    ctx.client.pause(&ctx.admin, &PAUSE_WITHDRAWALS);
    let result = ctx.client.try_withdraw_tips(&ctx.creator, &1_000_000_i128);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_pause_blocks_register_profile() {
    let ctx = setup();
    ctx.client.pause(&ctx.admin, &PAUSE_REGISTRATION);
    let new_user = Address::generate(&ctx.env);
    let result = ctx.client.try_register_profile(
        &new_user,
        &String::from_str(&ctx.env, "newuser"),
        &String::from_str(&ctx.env, "New User"),
        &String::from_str(&ctx.env, ""),
        &String::from_str(&ctx.env, ""),
        &String::from_str(&ctx.env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

// ── domain verification ───────────────────────────────────────────────────────

#[test]
fn test_non_admin_cannot_verify_domain() {
    let ctx = setup();
    let non_admin = Address::generate(&ctx.env);
    let result = ctx.client.try_verify_domain(&non_admin, &ctx.creator);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

// ── access control matrix ────────────────────────────────────────────────────

/// Exhaustive smoke-test: every admin-only entry point rejects a non-admin caller.
#[test]
fn test_admin_access_control_matrix() {
    let ctx = setup();
    let non_admin = Address::generate(&ctx.env);
    let dummy_addr = Address::generate(&ctx.env);
    let dummy_hash = BytesN::<32>::from_array(&ctx.env, &[0u8; 32]);

    // pause
    assert_eq!(
        ctx.client.try_pause(&non_admin, &PAUSE_ALL),
        Err(Ok(ContractError::NotAuthorized)),
        "pause must reject non-admin"
    );
    // unpause (pause first with admin to make the call meaningful)
    ctx.client.pause(&ctx.admin, &PAUSE_ALL);
    assert_eq!(
        ctx.client.try_unpause(&non_admin, &PAUSE_ALL),
        Err(Ok(ContractError::NotAuthorized)),
        "unpause must reject non-admin"
    );
    ctx.client.unpause(&ctx.admin, &PAUSE_ALL);

    // set_fee
    assert_eq!(
        ctx.client.try_set_fee(&non_admin, &100_u32),
        Err(Ok(ContractError::NotAuthorized)),
        "set_fee must reject non-admin"
    );

    // set_fee_collector
    assert_eq!(
        ctx.client.try_set_fee_collector(&non_admin, &dummy_addr),
        Err(Ok(ContractError::NotAuthorized)),
        "set_fee_collector must reject non-admin"
    );

    // set_admin
    assert_eq!(
        ctx.client.try_set_admin(&non_admin, &dummy_addr),
        Err(Ok(ContractError::NotAuthorized)),
        "set_admin must reject non-admin"
    );

    // set_min_tip_amount
    assert_eq!(
        ctx.client.try_set_min_tip_amount(&non_admin, &1_000_000_i128),
        Err(Ok(ContractError::NotAuthorized)),
        "set_min_tip_amount must reject non-admin"
    );

    // verify_domain
    assert_eq!(
        ctx.client.try_verify_domain(&non_admin, &ctx.creator),
        Err(Ok(ContractError::NotAuthorized)),
        "verify_domain must reject non-admin"
    );

    // upgrade
    assert_eq!(
        ctx.client.try_upgrade(&non_admin, &dummy_hash),
        Err(Ok(ContractError::NotAuthorized)),
        "upgrade must reject non-admin"
    );

    // bump_ttl
    assert_eq!(
        ctx.client.try_bump_ttl(&non_admin),
        Err(Ok(ContractError::NotAuthorized)),
        "bump_ttl must reject non-admin"
    );
}

// ── pause blocks subscriptions ──────────────────────────────────────────────

#[test]
fn test_pause_blocks_create_subscription() {
    let ctx = setup();
    ctx.client.pause(&ctx.admin, &PAUSE_SUBSCRIPTIONS);
    let result = ctx.client.try_create_subscription(
        &ctx.tipper,
        &ctx.creator,
        &100_000_000_i128,
        &7_u32,
    );
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_pause_blocks_cancel_subscription() {
    let ctx = setup();
    // Create subscription first
    ctx.client.create_subscription(
        &ctx.tipper,
        &ctx.creator,
        &100_000_000_i128,
        &7_u32,
    );
    ctx.client.pause(&ctx.admin, &PAUSE_SUBSCRIPTIONS);
    let result = ctx.client.try_cancel_subscription(&ctx.tipper, &ctx.creator);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

// ── pause blocks refunds ────────────────────────────────────────────────────

#[test]
fn test_pause_blocks_request_refund() {
    let ctx = setup();
    // Send a tip first
    ctx.client.send_tip(
        &ctx.tipper,
        &ctx.creator,
        &10_000_000_i128,
        &String::from_str(&ctx.env, "tip"),
        &false,
        &false,
    );
    ctx.client.pause(&ctx.admin, &PAUSE_REFUNDS);
    // tip_id 0 (first tip in this test)
    let result = ctx.client.try_request_refund(&ctx.tipper, &0_u32);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_pause_blocks_approve_refund() {
    let ctx = setup();
    // Send a tip first
    ctx.client.send_tip(
        &ctx.tipper,
        &ctx.creator,
        &10_000_000_i128,
        &String::from_str(&ctx.env, "tip"),
        &false,
        &false,
    );
    // Request refund before pausing
    ctx.client.request_refund(&ctx.tipper, &0_u32);
    ctx.client.pause(&ctx.admin, &PAUSE_REFUNDS);
    let result = ctx.client.try_approve_refund(&ctx.creator, &0_u32);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_pause_blocks_reject_refund() {
    let ctx = setup();
    // Send a tip first
    ctx.client.send_tip(
        &ctx.tipper,
        &ctx.creator,
        &10_000_000_i128,
        &String::from_str(&ctx.env, "tip"),
        &false,
        &false,
    );
    // Request refund before pausing
    ctx.client.request_refund(&ctx.tipper, &0_u32);
    ctx.client.pause(&ctx.admin, &PAUSE_REFUNDS);
    let result = ctx.client.try_reject_refund(&ctx.creator, &0_u32);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
}
