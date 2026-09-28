//! Tests for multi-token support functionality

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::test::test_init::setup_test_contract_default;
use crate::TipzContractClient;

#[test]
fn test_add_accepted_token() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _fee_collector, _native_token) = setup_test_contract_default(&env);

    let usdc_token = Address::generate(&env);
    let oracle = Address::generate(&env);

    // Add token to whitelist
    client.add_accepted_token(&admin, &usdc_token, &Some(oracle.clone()));

    // Check token is in accepted list
    let accepted = client.get_accepted_tokens();
    assert_eq!(accepted.len(), 1);
    assert_eq!(accepted.get(0).unwrap().token_address, usdc_token);
}

#[test]
fn test_reject_non_whitelisted_token() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract_default(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);
    let random_token = Address::generate(&env);

    // Register creator
    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    // Try to tip with non-whitelisted token (should fail)
    let result = client.try_send_tip_token(
        &tipper,
        &creator,
        &100,
        &random_token,
        &String::from_str(&env, "Test"),
        &false,
    );

    assert!(result.is_err());
}

#[test]
fn test_tip_with_usdc() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _fee_collector, native_token) = setup_test_contract_default(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

    // Register USDC token
    let usdc_token = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &usdc_token.address());
    usdc_admin_client.mint(&tipper, &10000);

    // Add USDC to whitelist
    client.add_accepted_token(&admin, &usdc_token.address(), &None);

    // Register creator
    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    // Send tip with USDC
    client.send_tip_token(
        &tipper,
        &creator,
        &1000,
        &usdc_token.address(),
        &String::from_str(&env, "Here's some USDC!"),
        &false,
    );

    // Check token balance
    let balances = client.get_token_balances(&creator);
    assert_eq!(balances.len(), 1);
    assert_eq!(balances.get(0).unwrap().amount, 1000);
}

#[test]
fn test_withdraw_specific_token() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _fee_collector, _native_token) = setup_test_contract_default(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

    // Register USDC token
    let usdc_token = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &usdc_token.address());
    usdc_admin_client.mint(&tipper, &10000);

    // Add USDC to whitelist
    client.add_accepted_token(&admin, &usdc_token.address(), &None);

    // Register creator
    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    // Send tip with USDC
    client.send_tip_token(
        &tipper,
        &creator,
        &1000,
        &usdc_token.address(),
        &String::from_str(&env, "Tip"),
        &false,
    );

    // Withdraw USDC
    client.withdraw_token(&creator, &usdc_token.address(), &500);

    // Check remaining balance
    let balances = client.get_token_balances(&creator);
    // Balance should be less than 500 due to fees
    assert!(balances.get(0).unwrap().amount < 500);
}

#[test]
fn test_remove_accepted_token() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _fee_collector, _native_token) = setup_test_contract_default(&env);

    let usdc_token = Address::generate(&env);

    // Add token
    client.add_accepted_token(&admin, &usdc_token, &None);

    // Remove token
    client.remove_accepted_token(&admin, &usdc_token);

    // Check token is not in accepted list
    let accepted = client.get_accepted_tokens();
    assert_eq!(accepted.len(), 0);
}
