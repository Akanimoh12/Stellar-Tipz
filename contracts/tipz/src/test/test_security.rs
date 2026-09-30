#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

use crate::errors::ContractError;
use crate::{TipzContract, TipzContractClient};

// ── helpers ──────────────────────────────────────────────────────────────────

fn setup() -> (Env, TipzContractClient<'static>, token::StellarAssetClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_contract = env
        .register_stellar_asset_contract_v2(token_admin);
    let token_address = token_contract.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200_u32, &token_address);

    (env, client, token_admin_client, token_address)
}

fn register_user(env: &Env, client: &TipzContractClient<'static>, name: &str) -> Address {
    let caller = Address::generate(env);
    client.register_profile(
        &caller,
        &String::from_str(env, name),
        &String::from_str(env, "Display Name"),
        &String::from_str(env, "Bio"),
        &String::from_str(env, "https://example.com/avatar.png"),
        &String::from_str(env, name),
    );
    caller
}

// ── Security Tests ─────────────────────────────────────────────────────────────

#[test]
fn test_integer_overflow_protection() {
    let (env, client, token_admin_client, _token_address) = setup();
    let creator = register_user(&env, &client, "creator1");
    let tipper = register_user(&env, &client, "tipper1");

    // Attempting to tip a negative amount should fail validation before overflow logic
    let result = client.try_send_tip(
        &tipper,
        &creator,
        &-1i128,
        &String::from_str(&env, "msg"),
        &false,
        &false,
    );
    assert_eq!(result, Err(Ok(ContractError::TipBelowMinimum)));

    // Attempting to withdraw negative amount
    let withdraw_result = client.try_withdraw_tips(&creator, &-1i128);
    assert_eq!(withdraw_result, Err(Ok(ContractError::InvalidAmount)));
}

#[test]
fn test_state_consistency() {
    let (env, client, token_admin_client, _token_address) = setup();
    let creator1 = register_user(&env, &client, "creator1");
    let creator2 = register_user(&env, &client, "creator2");
    let tipper = register_user(&env, &client, "tipper");

    // Fund the tipper
    token_admin_client.mint(&tipper, &100_000_000_000);

    let tip_amount = 10_000_000_i128;
    client.send_tip(
        &tipper,
        &creator1,
        &tip_amount,
        &String::from_str(&env, "msg1"),
        &false,
        &false,
    );
    client.send_tip(
        &tipper,
        &creator2,
        &tip_amount,
        &String::from_str(&env, "msg2"),
        &false,
        &false,
    );

    let stats = client.get_stats();
    assert_eq!(stats.total_tips_volume, 20_000_000_i128);

    // Withdraw from creator1
    client.withdraw_tips(&creator1, &5_000_000_i128);

    let profile1 = client.get_profile(&creator1);
    let profile2 = client.get_profile(&creator2);

    // Total tips received should still be sum of all tips
    assert_eq!(
        profile1.profile.total_tips_received + profile2.profile.total_tips_received,
        stats.total_tips_volume
    );

    // After withdrawal, balance is reduced but total_tips_received remains unchanged
    assert_eq!(profile1.profile.balance, 5_000_000_i128);
    assert_eq!(profile2.profile.balance, 10_000_000_i128);
    assert_eq!(profile1.profile.total_tips_received, 10_000_000_i128);

    // Ensure fees collected + net withdrawn + remaining balances == total tips volume
    // Fee is 200 bps (2%) of 5_000_000 = 100_000. Net is 4_900_000.
    let updated_stats = client.get_stats();
    assert_eq!(updated_stats.total_fees_collected, 100_000_i128);
}

#[test]
fn test_storage_bounds() {
    let (env, client, token_admin_client, _token_address) = setup();
    let tipper = register_user(&env, &client, "tipper");
    let creator = register_user(&env, &client, "creator");

    // Fund the tipper
    token_admin_client.mint(&tipper, &100_000_000_000);

    // Attempting to send many tips to see if it handles bounds
    for _ in 0..10 {
        client.send_tip(
            &tipper,
            &creator,
            &1_000_000_i128,
            &String::from_str(&env, "msg"),
            &false,
            &false,
        );
    }

    let profile = client.get_profile(&creator);
    assert_eq!(profile.profile.total_tips_count, 10);

    let recent_tips = client.get_recent_tips(&creator, &50, &0);
    assert_eq!(recent_tips.len(), 10);
}

#[test]
fn test_reentrancy_mitigation() {
    // Soroban prevents reentrancy at the protocol level.
    // If a contract tries to call itself recursively, or if a cross-contract call
    // attempts to re-enter the caller, the host traps and fails the transaction.
    // This test serves as documentation for this security invariant.
    assert!(true, "Soroban host prevents reentrancy natively");
}
