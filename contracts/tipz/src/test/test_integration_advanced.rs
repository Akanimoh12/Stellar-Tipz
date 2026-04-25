//! Advanced integration tests for multi-user scenarios, edge cases, and full lifecycle.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, String, Vec};

use crate::TipzContract;
use crate::TipzContractClient;

/// Helper: set up a test environment with the contract initialized
fn setup_env() -> (
    Env,
    TipzContractClient<'static>,
    Address, // admin
    Address, // fee_collector
    Address, // token_address
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

    // Initialize the contract with 200 bps (2%) fee
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200_u32, &token_address);

    // Fund the fee collector with some XLM for testing
    token_admin_client.mint(&fee_collector, &1_000_000_000); // 100 XLM

    (env, client, admin, fee_collector, token_address)
}

/// Helper: register a creator profile
fn register_creator(
    env: &Env,
    client: &TipzContractClient,
    address: &Address,
    username: &str,
    display_name: &str,
) {
    client.register_profile(
        address,
        &String::from_str(env, username),
        &String::from_str(env, display_name),
        &String::from_str(env, "Bio"),
        &String::from_str(env, ""),
        &String::from_str(env, "x_handle"),
    );
}

/// Helper: create a tipper with funds
fn create_tipper(env: &Env, token_address: &Address, amount_stroops: i128) -> Address {
    let tipper = Address::generate(env);
    let token_client = token::StellarAssetClient::new(env, token_address);
    token_client.mint(&tipper, &amount_stroops);
    tipper
}

#[test]
fn test_multi_user_tipping_round_robin() {
    let (env, client, _admin, _fee_collector, token_address) = setup_env();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    // 1. Setup 5 users
    let mut users = Vec::new(&env);
    let usernames = ["user_0", "user_1", "user_2", "user_3", "user_4"];
    let display_names = ["User 0", "User 1", "User 2", "User 3", "User 4"];
    for i in 0..5 {
        let user = Address::generate(&env);
        register_creator(
            &env,
            &client,
            &user,
            usernames[i as usize],
            display_names[i as usize],
        );
        token_admin_client.mint(&user, &10_000_000_000); // 1000 XLM each
        users.push_back(user);
    }

    // 2. Round-robin tipping: user_i tips user_(i+1)
    let tip_amount: i128 = 500_000_000; // 50 XLM
    let message = String::from_str(&env, "Round robin!");

    for i in 0..5 {
        let tipper = users.get(i).unwrap();
        let receiver = users.get((i + 1) % 5).unwrap();
        client.send_tip(&tipper, &receiver, &tip_amount, &message, &false);
    }

    // 3. Verify balances: Each user should have exactly 50 XLM in contract balance
    for i in 0..5 {
        let user = users.get(i).unwrap();
        let profile = client.get_profile(&user);
        assert_eq!(profile.balance, tip_amount);
    }

    // 4. Verify leaderboard
    let leaderboard = client.get_leaderboard(&10);
    assert_eq!(leaderboard.len(), 5);
    for entry in leaderboard.iter() {
        assert_eq!(entry.total_tips_received, tip_amount);
    }
}

#[test]
fn test_withdrawal_drains_entire_balance() {
    let (env, client, _admin, fee_collector, token_address) = setup_env();
    let token_client = token::TokenClient::new(&env, &token_address);

    let creator = Address::generate(&env);
    register_creator(&env, &client, &creator, "creator", "Creator");

    let tipper = create_tipper(&env, &token_address, 1_000_000_000); // 100 XLM
    let tip_amount: i128 = 1_000_000_000;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Tip"),
        &false,
    );

    let profile_before = client.get_profile(&creator);
    assert_eq!(profile_before.balance, tip_amount);

    // Withdraw full balance
    client.withdraw_tips(&creator, &tip_amount);

    let profile_after = client.get_profile(&creator);
    assert_eq!(profile_after.balance, 0);

    // Verify fee collector received 2% (200 bps)
    let fee_collector_balance = token_client.balance(&fee_collector);
    // Initial 100 XLM + 2 XLM fee
    assert_eq!(fee_collector_balance, 1_020_000_000);
}

#[test]
fn test_rapid_tips_same_creator() {
    let (env, client, _admin, _fee_collector, token_address) = setup_env();
    let mut budget = env.budget();
    budget.reset_unlimited();

    let creator = Address::generate(&env);
    register_creator(&env, &client, &creator, "creator", "Creator");

    let tipper = create_tipper(&env, &token_address, 10_000_000_000); // 1000 XLM
    let tip_amount: i128 = 50_000_000; // 5 XLM
    let message = String::from_str(&env, "Rapid tip!");

    for _ in 0..100 {
        env.budget().reset_default();
        client.send_tip(&tipper, &creator, &tip_amount, &message, &false);
    }

    let profile = client.get_profile(&creator);
    assert_eq!(profile.balance, tip_amount * 100);
}

#[test]
fn test_leaderboard_overtake() {
    let (env, client, _admin, _fee_collector, token_address) = setup_env();

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    register_creator(&env, &client, &alice, "alice", "Alice");
    register_creator(&env, &client, &bob, "bob", "Bob");

    let tipper = create_tipper(&env, &token_address, 10_000_000_000); // 1000 XLM
    let message = String::from_str(&env, "Tip!");

    // Alice gets 100 XLM
    client.send_tip(&tipper, &alice, &1_000_000_000, &message, &false);
    // Bob gets 50 XLM
    client.send_tip(&tipper, &bob, &500_000_000, &message, &false);

    // Verify Alice is #1
    let leaderboard = client.get_leaderboard(&2);
    assert_eq!(leaderboard.get(0).unwrap().address, alice);
    assert_eq!(leaderboard.get(1).unwrap().address, bob);

    // Bob gets 100 XLM more (total 150 XLM)
    client.send_tip(&tipper, &bob, &1_000_000_000, &message, &false);

    // Verify Bob is #1
    let leaderboard_after = client.get_leaderboard(&2);
    assert_eq!(leaderboard_after.get(0).unwrap().address, bob);
    assert_eq!(leaderboard_after.get(1).unwrap().address, alice);
}

#[test]
fn test_full_lifecycle() {
    let (env, client, admin, _fee_collector, token_address) = setup_env();

    // 1. Register 3 users
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let charlie = Address::generate(&env);
    register_creator(&env, &client, &alice, "alice", "Alice");
    register_creator(&env, &client, &bob, "bob", "Bob");
    register_creator(&env, &client, &charlie, "charlie", "Charlie");

    // 2. Perform tips
    let tipper = create_tipper(&env, &token_address, 10_000_000_000);
    client.send_tip(
        &tipper,
        &alice,
        &1_000_000_000,
        &String::from_str(&env, "A"),
        &false,
    );
    client.send_tip(
        &tipper,
        &bob,
        &2_000_000_000,
        &String::from_str(&env, "B"),
        &false,
    );

    // 3. Update profiles
    client.update_profile(
        &alice,
        &Some(String::from_str(&env, "Alice Updated")),
        &None,
        &None,
        &None,
    );

    // 4. Update X metrics
    client.update_x_metrics(&admin, &alice, &1000, &500);

    // 5. Withdraw
    client.withdraw_tips(&bob, &1_000_000_000);

    // 6. Verify stats
    let stats = client.get_stats();
    assert_eq!(stats.total_creators, 3);
    assert_eq!(stats.total_tips_count, 2);
    assert_eq!(stats.total_tips_volume, 3_000_000_000);

    // 7. Bump TTL
    client.bump_ttl(&admin);
}

#[test]
fn test_admin_rotation() {
    let (env, client, admin, _fee_collector, _token_address) = setup_env();
    let new_admin = Address::generate(&env);

    // Current admin rotates to new admin
    client.set_admin(&admin, &new_admin);

    // Old admin can't act anymore
    let res = client.try_set_fee(&admin, &300);
    assert!(res.is_err());

    // New admin can act
    client.set_fee(&new_admin, &300);
    assert_eq!(client.get_stats().fee_bps, 300);
}

#[test]
fn test_fee_change_mid_tip() {
    let (env, client, admin, fee_collector, token_address) = setup_env();
    let token_client = token::TokenClient::new(&env, &token_address);

    let creator = Address::generate(&env);
    register_creator(&env, &client, &creator, "creator", "Creator");

    let tipper = create_tipper(&env, &token_address, 1_000_000_000); // 100 XLM
    let tip_amount: i128 = 1_000_000_000;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Tip"),
        &false,
    );

    // Fee is 200 bps (2%)
    // Change fee to 500 bps (5%)
    client.set_fee(&admin, &500);

    let fee_collector_balance_before = token_client.balance(&fee_collector);

    // Withdraw full balance
    client.withdraw_tips(&creator, &tip_amount);

    let fee_collector_balance_after = token_client.balance(&fee_collector);

    // Fee should be 5% of 100 XLM = 5 XLM
    assert_eq!(
        fee_collector_balance_after - fee_collector_balance_before,
        50_000_000
    );
}
