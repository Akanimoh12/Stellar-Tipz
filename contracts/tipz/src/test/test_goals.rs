//! Tests for goal tracking functionality

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

use crate::test::test_init::setup_test_contract_simple;
use crate::TipzContractClient;

fn fund_tipper(client: &TipzContractClient, env: &Env, tipper: &Address) {
    let token = client.get_config().native_token;
    token::StellarAssetClient::new(env, &token).mint(tipper, &100_000_000_000);
}

#[test]
fn test_set_and_track_goal() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract_simple(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);
    fund_tipper(&client, &env, &tipper);

    // Register creator
    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    // Set goal (target > MIN_TIP so the tip doesn't fully reach it)
    let desc = String::from_str(&env, "Raise funds for new equipment");
    let deadline = env.ledger().timestamp() + 86400; // 1 day from now
    client.set_goal(&creator, &2_000_000, &desc, &deadline);

    // Send tip (must be >= MIN_TIP = 1_000_000)
    client.send_tip(&tipper, &creator, &1_000_000, &String::from_str(&env, "Good luck!"), &false, &false);

    // Check goal progress
    let goal = client.get_goal(&creator);
    assert_eq!(goal.raised, 1_000_000);
    assert_eq!(goal.target, 2_000_000);
    assert!(goal.active);
    assert!(goal.reached_at.is_none());
}

#[test]
fn test_goal_reached_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract_simple(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);
    fund_tipper(&client, &env, &tipper);

    // Register creator
    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    // Set goal
    let desc = String::from_str(&env, "Small goal");
    client.set_goal(&creator, &1_000_000, &desc, &0);

    // Send tip that reaches goal
    client.send_tip(&tipper, &creator, &1_000_000, &String::from_str(&env, "Here you go!"), &false, &false);

    // Check goal is reached
    let goal = client.get_goal(&creator);
    assert_eq!(goal.raised, 1_000_000);
    assert!(goal.reached_at.is_some());
}

#[test]
fn test_cancel_goal() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract_simple(&env);

    let creator = Address::generate(&env);

    // Register creator
    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    // Set goal
    let desc = String::from_str(&env, "Test goal");
    client.set_goal(&creator, &1_000_000, &desc, &0);

    // Cancel goal
    client.cancel_goal(&creator);

    // Check goal is inactive
    let goal = client.get_goal(&creator);
    assert!(!goal.active);
}

#[test]
fn test_get_goal_when_none_exists() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract_simple(&env);

    let creator = Address::generate(&env);

    // Register creator
    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    // Try to get goal when none exists
    let result = client.try_get_goal(&creator);
    assert_eq!(result, Err(Ok(crate::errors::ContractError::NotFound)));
}

#[test]
fn test_multiple_sequential_goals() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract_simple(&env);

    let creator = Address::generate(&env);

    // Register creator
    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    // Set first goal
    let desc1 = String::from_str(&env, "First goal");
    client.set_goal(&creator, &1_000_000, &desc1, &0);

    // Set second goal (should archive first)
    let desc2 = String::from_str(&env, "Second goal");
    client.set_goal(&creator, &2_000_000, &desc2, &0);

    // Check active goal is the second one
    let goal = client.get_goal(&creator);
    assert_eq!(goal.target, 2_000_000);
    assert_eq!(goal.description, desc2);

    // Check archived goals
    let archived = client.get_archived_goals(&creator);
    assert_eq!(archived.len(), 1);
}
