//! Integration test for the full happy path of the Tipz contract.
//!
//! This test ensures all modules integrate correctly by exercising the complete
//! user journey from initialization through tipping and withdrawal.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

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

    // Initialize the contract with 250 bps (2.5%) fee
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &250_u32, &token_address);

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
fn test_full_happy_path() {
    let (env, client, _admin, fee_collector, token_address) = setup_env();

    // ──────────────────────────────────────────────────────────────────────────
    // Step 1: Register 3 creator profiles (alice, bob, charlie)
    // ──────────────────────────────────────────────────────────────────────────

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let charlie = Address::generate(&env);

    register_creator(&env, &client, &alice, "alice", "Alice");
    register_creator(&env, &client, &bob, "bob", "Bob");
    register_creator(&env, &client, &charlie, "charlie", "Charlie");

    // ──────────────────────────────────────────────────────────────────────────
    // Step 2: Tip - Tipper sends 1000 XLM to alice, 500 XLM to bob, 200 XLM to charlie
    // ──────────────────────────────────────────────────────────────────────────

    let tipper = create_tipper(&env, &token_address, 2_000_000_000); // 200 XLM

    let amount_alice: i128 = 800_000_000; // 80 XLM (below cap)
    let amount_bob: i128 = 400_000_000; // 40 XLM
    let amount_charlie: i128 = 200_000_000; // 20 XLM

    let message = String::from_str(&env, "Great work!");

    client.send_tip(&tipper, &alice, &amount_alice, &message, &false);
    client.send_tip(&tipper, &bob, &amount_bob, &message, &false);
    client.send_tip(&tipper, &charlie, &amount_charlie, &message, &false);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 3: Verify balances match tip amounts
    // ──────────────────────────────────────────────────────────────────────────

    let profile_alice = client.get_profile(&alice);
    let profile_bob = client.get_profile(&bob);
    let profile_charlie = client.get_profile(&charlie);

    assert_eq!(profile_alice.balance, amount_alice);
    assert_eq!(profile_bob.balance, amount_bob);
    assert_eq!(profile_charlie.balance, amount_charlie);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 4: Verify leaderboard: alice > bob > charlie
    // ──────────────────────────────────────────────────────────────────────────

    let leaderboard = client.get_leaderboard(&10); // Get top 10

    assert_eq!(leaderboard.len(), 3);
    assert_eq!(leaderboard.get(0).unwrap().address, alice);
    assert_eq!(
        leaderboard.get(0).unwrap().total_tips_received,
        amount_alice
    );
    assert_eq!(leaderboard.get(1).unwrap().address, bob);
    assert_eq!(leaderboard.get(1).unwrap().total_tips_received, amount_bob);
    assert_eq!(leaderboard.get(2).unwrap().address, charlie);
    assert_eq!(
        leaderboard.get(2).unwrap().total_tips_received,
        amount_charlie
    );

    // ──────────────────────────────────────────────────────────────────────────
    // Step 5: Verify credit scores: alice > bob > charlie
    // ──────────────────────────────────────────────────────────────────────────

    let (score_alice, _tier_alice) = client.get_credit_tier(&alice);
    let (score_bob, _tier_bob) = client.get_credit_tier(&bob);
    let (score_charlie, _tier_charlie) = client.get_credit_tier(&charlie);

    assert!(score_alice > score_bob);
    assert!(score_bob > score_charlie);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 6: Withdraw - alice withdraws 40 XLM
    // ──────────────────────────────────────────────────────────────────────────

    let withdraw_amount: i128 = 400_000_000; // 40 XLM

    // Before withdrawal, check fee collector balance
    let token_client = token::TokenClient::new(&env, &token_address);
    let fee_collector_balance_before = token_client.balance(&fee_collector);

    client.withdraw_tips(&alice, &withdraw_amount);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 7: Verify fee deduction: alice receives 39 XLM, fee collector gets 1 XLM
    // ──────────────────────────────────────────────────────────────────────────

    let alice_balance_after = token_client.balance(&alice);
    let fee_collector_balance_after = token_client.balance(&fee_collector);

    let expected_alice_receive: i128 = 390_000_000; // 39 XLM
    let expected_fee: i128 = 10_000_000; // 1 XLM

    assert_eq!(alice_balance_after, expected_alice_receive);
    assert_eq!(
        fee_collector_balance_after - fee_collector_balance_before,
        expected_fee
    );

    // Verify alice's contract balance is updated
    let profile_alice_after = client.get_profile(&alice);
    assert_eq!(profile_alice_after.balance, amount_alice - withdraw_amount);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 8: Verify stats: get_stats returns correct aggregate numbers
    // ──────────────────────────────────────────────────────────────────────────

    let stats = client.get_stats();

    assert_eq!(stats.total_creators, 3);
    assert_eq!(stats.total_tips_count, 3);
    assert_eq!(
        stats.total_tips_volume,
        amount_alice + amount_bob + amount_charlie
    );
    assert_eq!(stats.total_fees_collected, expected_fee);
    assert_eq!(stats.fee_bps, 250);

    // ──────────────────────────────────────────────────────────────────────────
    // Step 9: Verify events: All expected events were emitted
    // ──────────────────────────────────────────────────────────────────────────

    // TODO: Add event verification when contract events are fully implemented
    // For now, we verify the core functionality is working
}
