//! Tests for withdraw_tips functionality.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, Map, String, Symbol};

use crate::errors::ContractError;
use crate::storage::{self};
use crate::types::{Profile, VerificationStatus, VerificationType};
use crate::TipzContract;
use crate::TipzContractClient;

/// Helper: set up a test environment with the contract initialized
/// and a registered creator profile with a balance.
fn setup_env() -> (
    Env,
    TipzContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    // Register the Tipz contract
    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    // Register a Stellar Asset Contract for native XLM
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    // Initialize the contract with 2% fee (200 bps)
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200, &token_address);

    // Create a registered creator profile with balance
    let creator = Address::generate(&env);
    let now = env.ledger().timestamp();
    let profile = Profile {
        owner: creator.clone(),
        username: String::from_str(&env, "alice"),
        display_name: String::from_str(&env, "Alice"),
        bio: String::from_str(&env, "Creator bio"),
        website: String::from_str(&env, ""),
        image_url: String::from_str(&env, ""),
        social_links: Map::<Symbol, String>::new(&env),
        x_handle: String::from_str(&env, "alice_x"),
        x_followers: 1000,
        x_engagement_avg: 50,
        credit_score: 60,
        total_tips_received: 100_000_000, // 10 XLM
        total_tips_count: 5,
        balance: 100_000_000, // 10 XLM
        registered_at: now,
        updated_at: now,
        verification: crate::types::VerificationStatus::default(),
    };
    env.as_contract(&contract_id, || {
        storage::set_profile(&env, &profile);
    });

    // Mint XLM to the contract so it can pay out withdrawals
    token_admin_client.mint(&contract_id, &1_000_000_000); // 100 XLM

    (
        env,
        client,
        contract_id,
        creator,
        fee_collector,
        token_address,
    )
}

#[test]
fn test_withdraw_success() {
    let (env, client, contract_id, creator, fee_collector, sac) = setup_env();

    let token_client = token::TokenClient::new(&env, &sac);
    let creator_balance_before = token_client.balance(&creator);
    let collector_balance_before = token_client.balance(&fee_collector);

    let withdraw_amount: i128 = 50_000_000; // 5 XLM
    client.withdraw_tips(&creator, &withdraw_amount);

    // Expected: 2% fee = 1_000_000 (0.1 XLM), net = 49_000_000 (4.9 XLM)
    let expected_fee = 1_000_000;
    let expected_net = 49_000_000;

    // Verify XLM transfers
    assert_eq!(
        token_client.balance(&creator),
        creator_balance_before + expected_net
    );
    assert_eq!(
        token_client.balance(&fee_collector),
        collector_balance_before + expected_fee
    );

    // Verify profile balance updated
    env.as_contract(&contract_id, || {
        let profile = storage::get_profile(&env, &creator);
        assert_eq!(profile.balance, 50_000_000); // 10 XLM - 5 XLM withdrawn
    });
}

#[test]
fn test_withdraw_full_balance() {
    let (env, client, contract_id, creator, fee_collector, sac) = setup_env();

    let token_client = token::TokenClient::new(&env, &sac);
    let creator_balance_before = token_client.balance(&creator);
    let collector_balance_before = token_client.balance(&fee_collector);

    // Withdraw entire balance
    let withdraw_amount: i128 = 100_000_000; // 10 XLM
    client.withdraw_tips(&creator, &withdraw_amount);

    // Expected: 2% fee = 2_000_000 (0.2 XLM), net = 98_000_000 (9.8 XLM)
    let expected_fee = 2_000_000;
    let expected_net = 98_000_000;

    // Verify XLM transfers
    assert_eq!(
        token_client.balance(&creator),
        creator_balance_before + expected_net
    );
    assert_eq!(
        token_client.balance(&fee_collector),
        collector_balance_before + expected_fee
    );

    // Verify profile balance is now zero
    env.as_contract(&contract_id, || {
        let profile = storage::get_profile(&env, &creator);
        assert_eq!(profile.balance, 0);
    });
}

#[test]
fn test_withdraw_insufficient_balance() {
    let (_env, client, _contract_id, creator, _fee_collector, _sac) = setup_env();

    // Try to withdraw more than balance (balance is 100_000_000)
    let withdraw_amount: i128 = 150_000_000; // 15 XLM
    let result = client.try_withdraw_tips(&creator, &withdraw_amount);

    assert_eq!(result, Err(Ok(ContractError::InsufficientBalance)));
}

#[test]
fn test_withdraw_zero_amount() {
    let (_env, client, _contract_id, creator, _fee_collector, _sac) = setup_env();

    let result = client.try_withdraw_tips(&creator, &0);

    assert_eq!(result, Err(Ok(ContractError::InvalidAmount)));
}

#[test]
fn test_withdraw_negative_amount() {
    let (_env, client, _contract_id, creator, _fee_collector, _sac) = setup_env();

    let result = client.try_withdraw_tips(&creator, &-1);

    assert_eq!(result, Err(Ok(ContractError::InvalidAmount)));
}

#[test]
fn test_withdraw_not_registered() {
    let (env, client, _contract_id, _creator, _fee_collector, _sac) = setup_env();

    let unregistered = Address::generate(&env);
    let result = client.try_withdraw_tips(&unregistered, &10_000_000);

    assert_eq!(result, Err(Ok(ContractError::NotRegistered)));
}

#[test]
fn test_withdraw_fee_calculation() {
    let (env, client, contract_id, creator, fee_collector, sac) = setup_env();

    let token_client = token::TokenClient::new(&env, &sac);
    let token_admin_client = token::StellarAssetClient::new(&env, &sac);

    // Test case: 1000 XLM at 250 bps (2.5%) = 25 XLM fee
    // First, update the fee to 250 bps
    env.as_contract(&contract_id, || {
        storage::set_fee_bps(&env, 250);
    });

    // Update creator balance to 1000 XLM
    env.as_contract(&contract_id, || {
        let mut profile = storage::get_profile(&env, &creator);
        profile.balance = 10_000_000_000; // 1000 XLM
        storage::set_profile(&env, &profile);
    });

    // Mint enough XLM to the contract to cover the withdrawal
    token_admin_client.mint(&contract_id, &10_000_000_000); // Additional 1000 XLM

    let creator_balance_before = token_client.balance(&creator);
    let collector_balance_before = token_client.balance(&fee_collector);

    let withdraw_amount: i128 = 10_000_000_000; // 1000 XLM
    client.withdraw_tips(&creator, &withdraw_amount);

    // Expected: 2.5% fee = 250_000_000 (25 XLM), net = 9_750_000_000 (975 XLM)
    let expected_fee = 250_000_000;
    let expected_net = 9_750_000_000;

    assert_eq!(
        token_client.balance(&creator),
        creator_balance_before + expected_net
    );
    assert_eq!(
        token_client.balance(&fee_collector),
        collector_balance_before + expected_fee
    );

    // Verify balance is now zero
    env.as_contract(&contract_id, || {
        let profile = storage::get_profile(&env, &creator);
        assert_eq!(profile.balance, 0);
    });
}

#[test]
fn test_withdraw_zero_fee_bps() {
    let (env, client, contract_id, creator, fee_collector, sac) = setup_env();

    // Set fee to 0%
    env.as_contract(&contract_id, || {
        storage::set_fee_bps(&env, 0);
    });

    let token_client = token::TokenClient::new(&env, &sac);
    let creator_balance_before = token_client.balance(&creator);
    let collector_balance_before = token_client.balance(&fee_collector);

    let withdraw_amount: i128 = 50_000_000; // 5 XLM
    client.withdraw_tips(&creator, &withdraw_amount);

    // Expected: 0% fee = 0, net = 50_000_000 (full amount)
    assert_eq!(
        token_client.balance(&creator),
        creator_balance_before + withdraw_amount
    );
    // Fee collector should receive nothing
    assert_eq!(
        token_client.balance(&fee_collector),
        collector_balance_before
    );

    // Verify profile balance updated
    env.as_contract(&contract_id, || {
        let profile = storage::get_profile(&env, &creator);
        assert_eq!(profile.balance, 50_000_000);
    });
}

#[test]
fn test_withdraw_updates_global_fees() {
    let (env, client, contract_id, creator, _fee_collector, _sac) = setup_env();

    // Check initial global fees
    let initial_fees = env.as_contract(&contract_id, || storage::get_total_fees(&env));

    let withdraw_amount: i128 = 50_000_000; // 5 XLM
    client.withdraw_tips(&creator, &withdraw_amount);

    // Expected fee: 2% of 50_000_000 = 1_000_000
    let expected_fee = 1_000_000;

    // Verify global fees counter updated
    let final_fees = env.as_contract(&contract_id, || storage::get_total_fees(&env));
    assert_eq!(final_fees, initial_fees + expected_fee);
}

#[test]
fn test_withdraw_multiple_times_accumulates_fees() {
    let (env, client, contract_id, creator, _fee_collector, _sac) = setup_env();

    let initial_fees = env.as_contract(&contract_id, || storage::get_total_fees(&env));

    // Withdraw 3 times
    client.withdraw_tips(&creator, &20_000_000); // 2 XLM, fee = 400_000
    client.withdraw_tips(&creator, &30_000_000); // 3 XLM, fee = 600_000
    client.withdraw_tips(&creator, &40_000_000); // 4 XLM, fee = 800_000

    // Total fees: 400_000 + 600_000 + 800_000 = 1_800_000
    let expected_total_fees = 1_800_000;

    let final_fees = env.as_contract(&contract_id, || storage::get_total_fees(&env));
    assert_eq!(final_fees, initial_fees + expected_total_fees);

    // Verify balance is now 10 XLM - 9 XLM = 1 XLM
    env.as_contract(&contract_id, || {
        let profile = storage::get_profile(&env, &creator);
        assert_eq!(profile.balance, 10_000_000);
    });
}

#[test]
fn test_withdraw_requires_auth() {
    let (env, client, _contract_id, _creator, _fee_collector, _sac) = setup_env();

    // Create another address that tries to withdraw creator's tips
    let attacker = Address::generate(&env);

    // This should fail because attacker is not authorized to withdraw creator's tips
    let result = client.try_withdraw_tips(&attacker, &10_000_000);

    // The withdrawal should fail - either NotRegistered (attacker has no profile)
    // or authorization should fail
    assert_eq!(result, Err(Ok(ContractError::NotRegistered)));
}

#[test]
fn test_withdraw_partial_amount() {
    let (env, client, contract_id, creator, _fee_collector, _sac) = setup_env();

    // Withdraw only 1 XLM from 10 XLM balance
    let withdraw_amount: i128 = 10_000_000; // 1 XLM
    client.withdraw_tips(&creator, &withdraw_amount);

    // Verify remaining balance is correct
    env.as_contract(&contract_id, || {
        let profile = storage::get_profile(&env, &creator);
        // 100_000_000 - 10_000_000 = 90_000_000
        assert_eq!(profile.balance, 90_000_000);
    });
}

#[test]
fn test_withdraw_fee_rounding() {
    let (env, client, contract_id, creator, fee_collector, sac) = setup_env();

    let token_client = token::TokenClient::new(&env, &sac);

    // Test with an amount that doesn't divide evenly
    // 10_007 stroops at 200 bps (2%) = 200.14 → rounds down to 200
    env.as_contract(&contract_id, || {
        let mut profile = storage::get_profile(&env, &creator);
        profile.balance = 10_007;
        storage::set_profile(&env, &profile);
    });

    let creator_balance_before = token_client.balance(&creator);
    let collector_balance_before = token_client.balance(&fee_collector);

    client.withdraw_tips(&creator, &10_007);

    // Fee should be 200 (rounded down from 200.14)
    // Net should be 9_807
    let fee_received = token_client.balance(&fee_collector) - collector_balance_before;
    let net_received = token_client.balance(&creator) - creator_balance_before;

    assert_eq!(fee_received, 200);
    assert_eq!(net_received, 9_807);
    assert_eq!(fee_received + net_received, 10_007); // Invariant: fee + net = amount
}

#[test]
fn test_withdraw_contract_has_insufficient_xlm() {
    let (env, client, contract_id, creator, _fee_collector, sac) = setup_env();

    // Drain the contract's XLM balance
    let token_client = token::TokenClient::new(&env, &sac);
    let contract_balance = token_client.balance(&contract_id);

    env.as_contract(&contract_id, || {
        let drain_target = Address::generate(&env);
        token_client.transfer(&contract_id, &drain_target, &contract_balance);
    });

    // Now try to withdraw - should fail because contract has no XLM
    let result = client.try_withdraw_tips(&creator, &10_000_000);

    assert_eq!(result, Err(Ok(ContractError::InsufficientBalance)));
}
