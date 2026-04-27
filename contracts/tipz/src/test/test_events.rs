//! Tests for contract event emissions (issue #6).
//!
//! Verifies that each event helper publishes the correct topic structure and
//! data payload by inspecting `env.events().all()` after each call.

#![cfg(test)]

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events},
    Address, Env, String,
};

use crate::{events, TipzContract};

// ── helpers ──────────────────────────────────────────────────────────────────

/// Set up an env with a registered (but uninitialised) contract so that
/// `env.as_contract` can be used to emit events in a contract context.
fn setup() -> (Env, Address) {
    let env = Env::default();
    let contract_id = env.register_contract(None, TipzContract);
    (env, contract_id)
}

/// Assert that a topic `Val` matches the given `symbol_short!` symbol.
macro_rules! assert_topic {
    ($val:expr, $sym:expr) => {
        assert!(
            $sym.to_val().shallow_eq(&$val),
            "topic mismatch: expected {:?}",
            stringify!($sym)
        );
    };
}

// ── test_event_profile_registered ────────────────────────────────────────────

#[test]
fn test_event_profile_registered() {
    let (env, contract_id) = setup();
    let owner = Address::generate(&env);
    let username = String::from_str(&env, "alice");

    env.as_contract(&contract_id, || {
        events::emit_profile_registered(&env, &owner, &username);
    });

    let all = env.events().all();
    assert_eq!(all.len(), 1);
    let (_contract, topics, _data) = all.get(0).unwrap();
    assert_eq!(topics.len(), 2);
    assert_topic!(topics.get(0).unwrap(), symbol_short!("profile"));
    assert_topic!(topics.get(1).unwrap(), symbol_short!("register"));
}

// ── test_event_tip_sent ───────────────────────────────────────────────────────

#[test]
fn test_event_tip_sent() {
    let (env, contract_id) = setup();
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let message = String::from_str(&env, "thanks!");

    env.as_contract(&contract_id, || {
        events::emit_tip_sent(&env, 0, &from, &to, 5_000_000, &message, 1234567890, false);
    });

    let all = env.events().all();
    assert_eq!(all.len(), 1);
    let (_contract, topics, _data) = all.get(0).unwrap();
    assert_eq!(topics.len(), 2);
    assert_topic!(topics.get(0).unwrap(), symbol_short!("tip"));
    assert_topic!(topics.get(1).unwrap(), symbol_short!("sent"));
}

// ── test_event_tip_sent_contains_all_indexing_fields ─────────────────────────

#[test]
fn test_event_tip_sent_contains_all_indexing_fields() {
    let (env, contract_id) = setup();
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);
    let message = String::from_str(&env, "great work!");
    let tip_id: u32 = 42;
    let amount: i128 = 10_000_000;
    let timestamp: u64 = 1700000000;

    env.as_contract(&contract_id, || {
        events::emit_tip_sent(&env, tip_id, &tipper, &creator, amount, &message, timestamp, false);
    });

    let all = env.events().all();
    assert_eq!(all.len(), 1);
    let (_contract, topics, data) = all.get(0).unwrap();

    // Verify topics
    assert_eq!(topics.len(), 2);
    assert_topic!(topics.get(0).unwrap(), symbol_short!("tip"));
    assert_topic!(topics.get(1).unwrap(), symbol_short!("sent"));

    // Verify data contains all 6 fields by decoding the tuple
    let (ev_tip_id, ev_tipper, ev_creator, ev_amount, ev_message, ev_timestamp): (
        u32,
        Address,
        Address,
        i128,
        String,
        u64,
    ) = soroban_sdk::FromVal::from_val(&env, &data);

    assert_eq!(ev_tip_id, tip_id);
    assert_eq!(ev_tipper, tipper);
    assert_eq!(ev_creator, creator);
    assert_eq!(ev_amount, amount);
    assert_eq!(ev_message, message);
    assert_eq!(ev_timestamp, timestamp);
}

// ── test_event_tips_withdrawn ─────────────────────────────────────────────────

#[test]
fn test_event_tips_withdrawn() {
    let (env, contract_id) = setup();
    let creator = Address::generate(&env);

    env.as_contract(&contract_id, || {
        events::emit_tips_withdrawn(&env, &creator, 10_000_000, 200_000);
    });

    let all = env.events().all();
    assert_eq!(all.len(), 1);
    let (_contract, topics, _data) = all.get(0).unwrap();
    assert_eq!(topics.len(), 2);
    assert_topic!(topics.get(0).unwrap(), symbol_short!("tip"));
    assert_topic!(topics.get(1).unwrap(), symbol_short!("withdrawn"));
}

// ── test_event_credit_score_updated ──────────────────────────────────────────

#[test]
fn test_event_credit_score_updated() {
    let (env, contract_id) = setup();
    let creator = Address::generate(&env);

    env.as_contract(&contract_id, || {
        events::emit_credit_score_updated(&env, &creator, 40, 65);
    });

    let all = env.events().all();
    assert_eq!(all.len(), 1);
    let (_contract, topics, _data) = all.get(0).unwrap();
    assert_eq!(topics.len(), 2);
    assert_topic!(topics.get(0).unwrap(), symbol_short!("credit"));
    assert_topic!(topics.get(1).unwrap(), symbol_short!("updated"));
}

// ── test_event_admin_changed ──────────────────────────────────────────────────

#[test]
fn test_event_admin_changed() {
    let (env, contract_id) = setup();
    let old_admin = Address::generate(&env);
    let new_admin = Address::generate(&env);

    env.as_contract(&contract_id, || {
        events::emit_admin_changed(&env, &old_admin, &new_admin);
    });

    let all = env.events().all();
    assert_eq!(all.len(), 1);
    let (_contract, topics, _data) = all.get(0).unwrap();
    assert_eq!(topics.len(), 2);
    assert_topic!(topics.get(0).unwrap(), symbol_short!("admin"));
    assert_topic!(topics.get(1).unwrap(), symbol_short!("changed"));
}

// ── test_event_fee_updated ────────────────────────────────────────────────────

#[test]
fn test_event_fee_updated() {
    let (env, contract_id) = setup();

    env.as_contract(&contract_id, || {
        events::emit_fee_updated(&env, 200, 300);
    });

    let all = env.events().all();
    assert_eq!(all.len(), 1);
    let (_contract, topics, _data) = all.get(0).unwrap();
    assert_eq!(topics.len(), 2);
    assert_topic!(topics.get(0).unwrap(), symbol_short!("fee"));
    assert_topic!(topics.get(1).unwrap(), symbol_short!("updated"));
}
