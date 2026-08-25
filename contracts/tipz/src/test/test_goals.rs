//! Tests for goal tracking functionality

#![cfg(test)]

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events},
    Address, Env, String, Symbol,
};

use crate::test::test_init::setup_test_contract;
use crate::TipzContractClient;

/// Find the `goal_completed` event in `env.events().all()` and return its data.
/// Panics if the event is not found.
fn find_goal_completed_event(env: &Env) -> (Address, u64, i128, i128, u32) {
    let all = env.events().all();
    for i in 0..all.len() {
        let (_contract, topics, data) = all.get(i).unwrap();
        if topics.len() == 2 {
            let t0 = topics.get(0).unwrap();
            let t1 = topics.get(1).unwrap();
            if Symbol::new(env, "goal").shallow_eq(&t0)
                && symbol_short!("completed").to_val().shallow_eq(&t1)
            {
                return soroban_sdk::FromVal::from_val(env, &data);
            }
        }
    }
    panic!("goal_completed event not found");
}

/// Assert that no `goal_completed` event exists in `env.events().all()`.
fn assert_no_goal_completed_event(env: &Env) {
    let all = env.events().all();
    for i in 0..all.len() {
        let (_contract, topics, _data) = all.get(i).unwrap();
        if topics.len() == 2 {
            let t0 = topics.get(0).unwrap();
            let t1 = topics.get(1).unwrap();
            if Symbol::new(env, "goal").shallow_eq(&t0)
                && symbol_short!("completed").to_val().shallow_eq(&t1)
            {
                panic!("unexpected goal_completed event found at index {}", i);
            }
        }
    }
}

#[test]
fn test_set_and_track_goal() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

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
    let desc = String::from_str(&env, "Raise funds for new equipment");
    let deadline = env.ledger().timestamp() + 86400; // 1 day from now
    client.set_goal(&creator, &1000, &desc, &deadline);

    // Send tip
    client.send_tip(&tipper, &creator, &500, &String::from_str(&env, "Good luck!"), &false, &false);

    // Check goal progress
    let goal = client.get_goal(&creator);
    assert_eq!(goal.raised, 500);
    assert_eq!(goal.target, 1000);
    assert!(goal.active);
    assert!(goal.reached_at.is_none());
}

#[test]
fn test_goal_reached_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

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
    client.set_goal(&creator, &100, &desc, &0);

    // Send tip that reaches goal
    client.send_tip(&tipper, &creator, &100, &String::from_str(&env, "Here you go!"), &false, &false);

    // Check goal is reached
    let goal = client.get_goal(&creator);
    assert_eq!(goal.raised, 100);
    assert!(goal.reached_at.is_some());
}

#[test]
fn test_cancel_goal() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract(&env);

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
    client.set_goal(&creator, &1000, &desc, &0);

    // Cancel goal
    client.cancel_goal(&creator);

    // Check goal is inactive
    let goal = client.get_goal(&creator);
    assert!(!goal.active);
}

#[test]
#[should_panic(expected = "NotFound")]
fn test_get_goal_when_none_exists() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract(&env);

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
    client.get_goal(&creator);
}

#[test]
fn test_multiple_sequential_goals() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract(&env);

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
    client.set_goal(&creator, &1000, &desc1, &0);

    // Set second goal (should archive first)
    let desc2 = String::from_str(&env, "Second goal");
    client.set_goal(&creator, &2000, &desc2, &0);

    // Check active goal is the second one
    let goal = client.get_goal(&creator);
    assert_eq!(goal.target, 2000);
    assert_eq!(goal.description, desc2);

    // Check archived goals
    let archived = client.get_archived_goals(&creator);
    assert_eq!(archived.len(), 1);
}

// ── goal_completed event tests ────────────────────────────────────────────────

#[test]
fn test_goal_completed_emitted_on_exact_target_hit() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    client.set_goal(&creator, &1000, &String::from_str(&env, "Exact hit"), &0);

    // Tip exactly to the target
    client.send_tip(&tipper, &creator, &1000, &String::from_str(&env, "Exact!"), &false, &false);

    let (ev_creator, _goal_id, ev_target, ev_final, _ledger) = find_goal_completed_event(&env);
    assert_eq!(ev_creator, creator);
    assert_eq!(ev_target, 1000);
    assert_eq!(ev_final, 1000);
}

#[test]
fn test_goal_completed_emitted_on_overshoot() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    client.set_goal(&creator, &500, &String::from_str(&env, "Small goal"), &0);

    // Tip exceeds the target
    client.send_tip(&tipper, &creator, &800, &String::from_str(&env, "Big tip!"), &false, &false);

    let (ev_creator, _goal_id, ev_target, ev_final, _ledger) = find_goal_completed_event(&env);
    assert_eq!(ev_creator, creator);
    assert_eq!(ev_target, 500);
    assert_eq!(ev_final, 800);
}

#[test]
fn test_goal_completed_not_re_emitted_after_completion() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _admin, _fee_collector, _native_token) = setup_test_contract(&env);

    let creator = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);

    client.register_profile(
        &creator,
        &String::from_str(&env, "creator"),
        &String::from_str(&env, "Creator"),
        &String::from_str(&env, "Bio"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    client.set_goal(&creator, &1000, &String::from_str(&env, "Goal"), &0);

    // First tip completes the goal
    client.send_tip(&tipper1, &creator, &1000, &String::from_str(&env, "Done!"), &false, &false);

    // Drain events from the first tip
    let _ = env.events().all();

    // Second tip after completion should NOT emit goal_completed
    client.send_tip(&tipper2, &creator, &500, &String::from_str(&env, "Extra"), &false, &false);

    assert_no_goal_completed_event(&env);
}
