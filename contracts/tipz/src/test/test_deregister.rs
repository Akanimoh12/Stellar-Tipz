//! Tests for profile deregistration (issue #222).

#![cfg(test)]

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events},
    Address, Env, String,
};

use crate::errors::ContractError;
use crate::storage;
use crate::types::Profile;
use crate::{TipzContract, TipzContractClient};

// ── helpers ──────────────────────────────────────────────────────────────────

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

/// Set up a test environment with an initialized contract.
fn setup() -> (Env, TipzContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_address = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200_u32, &token_address);

    (env, client, contract_id)
}

/// Register a profile with default values and zero balance.
fn register_default_profile(env: &Env, client: &TipzContractClient, caller: &Address) -> Profile {
    client.register_profile(
        caller,
        &String::from_str(env, "alice"),
        &String::from_str(env, "Alice Smith"),
        &String::from_str(env, "Hello, I make content!"),
        &String::from_str(env, "https://example.com/avatar.png"),
        &String::from_str(env, "alice_x"),
    )
}

// ── success path ─────────────────────────────────────────────────────────────

#[test]
fn test_deregister_profile_success() {
    let (env, client, contract_id) = setup();
    let caller = Address::generate(&env);

    // Register a profile with zero balance
    register_default_profile(&env, &client, &caller);

    // Verify profile exists before deregistration
    env.as_contract(&contract_id, || {
        assert!(storage::has_profile(&env, &caller));
    });

    // Get initial total creators count
    let initial_total_creators =
        env.as_contract(&contract_id, || storage::get_total_creators(&env));

    // Deregister the profile
    client.deregister_profile(&caller);

    // Verify profile no longer exists
    env.as_contract(&contract_id, || {
        assert!(!storage::has_profile(&env, &caller));
    });

    // Verify username lookup no longer exists
    env.as_contract(&contract_id, || {
        let username = String::from_str(&env, "alice");
        assert_eq!(storage::get_username_address(&env, &username), None);
    });

    // Verify TotalCreators decremented by one
    let final_total_creators = env.as_contract(&contract_id, || storage::get_total_creators(&env));
    assert_eq!(final_total_creators, initial_total_creators - 1);
}

// ── error conditions ─────────────────────────────────────────────────────────

#[test]
fn test_deregister_profile_balance_not_zero() {
    let (env, client, contract_id) = setup();
    let caller = Address::generate(&env);

    // Register a profile
    register_default_profile(&env, &client, &caller);

    // Add balance > 0 to the profile
    env.as_contract(&contract_id, || {
        let mut profile = storage::get_profile(&env, &caller);
        profile.balance = 100_000_000; // 10 XLM
        storage::set_profile(&env, &profile);
    });

    // Attempt to deregister with non-zero balance
    let result = client.try_deregister_profile(&caller);
    assert_eq!(result, Err(Ok(ContractError::BalanceNotZero)));

    // Verify profile still exists (no state changes)
    env.as_contract(&contract_id, || {
        assert!(storage::has_profile(&env, &caller));
    });
}

#[test]
fn test_deregister_profile_not_registered() {
    let (env, client, _contract_id) = setup();
    let caller = Address::generate(&env);

    // Call deregister_profile on an address without a profile
    let result = client.try_deregister_profile(&caller);
    assert_eq!(result, Err(Ok(ContractError::NotRegistered)));
}

// ── event emission ───────────────────────────────────────────────────────────

#[test]
fn test_deregister_profile_emits_event() {
    let (env, client, _contract_id) = setup();
    let caller = Address::generate(&env);

    // Register a profile with zero balance
    register_default_profile(&env, &client, &caller);

    // Deregister the profile
    client.deregister_profile(&caller);

    // Verify ProfileDeregistered event was emitted
    let events = env.events().all();
    let last_event = events.last().unwrap();
    let (_contract, topics, data) = last_event;

    // Check event topics
    assert_eq!(topics.len(), 2);
    assert_topic!(topics.get(0).unwrap(), symbol_short!("profile"));
    assert_topic!(topics.get(1).unwrap(), symbol_short!("deregist"));

    // Check event data contains correct address and username
    let (event_address, event_username): (Address, String) =
        soroban_sdk::FromVal::from_val(&env, &data);
    assert_eq!(event_address, caller);
    assert_eq!(event_username, String::from_str(&env, "alice"));
}

// ── idempotency ──────────────────────────────────────────────────────────────

#[test]
fn test_deregister_profile_idempotent() {
    let (env, client, _contract_id) = setup();
    let caller = Address::generate(&env);

    // Register a profile with zero balance
    register_default_profile(&env, &client, &caller);

    // Deregister successfully
    client.deregister_profile(&caller);

    // Attempt to deregister again on the same address
    let result = client.try_deregister_profile(&caller);
    assert_eq!(result, Err(Ok(ContractError::NotRegistered)));
}

// ── leaderboard removal ──────────────────────────────────────────────────────

#[test]
fn test_deregister_profile_removes_from_leaderboard() {
    let (env, client, contract_id) = setup();
    let caller = Address::generate(&env);

    // Register a profile
    register_default_profile(&env, &client, &caller);

    // Add profile to leaderboard by giving it a high tip total
    env.as_contract(&contract_id, || {
        let mut profile = storage::get_profile(&env, &caller);
        profile.total_tips_received = 1_000_000_000; // 100 XLM
        profile.balance = 0; // Keep balance at zero for deregistration
        storage::set_profile(&env, &profile);

        // Manually add to leaderboard
        crate::leaderboard::update_leaderboard(&env, &profile, crate::types::LeaderboardPeriod::AllTime, profile.total_tips_received);
    });

    // Verify profile is on leaderboard before deregistration
    let is_on_leaderboard_before = env.as_contract(&contract_id, || {
        crate::leaderboard::is_on_leaderboard(&env, crate::types::LeaderboardPeriod::AllTime, &caller)
    });
    assert!(is_on_leaderboard_before);

    // Get leaderboard size before deregistration
    let leaderboard_before = client.get_leaderboard(&crate::types::LeaderboardPeriod::AllTime, &100);
    let size_before = leaderboard_before.len();

    // Deregister the profile
    client.deregister_profile(&caller);

    // Verify profile is not on leaderboard after deregistration
    let is_on_leaderboard_after = env.as_contract(&contract_id, || {
        crate::leaderboard::is_on_leaderboard(&env, crate::types::LeaderboardPeriod::AllTime, &caller)
    });
    assert!(!is_on_leaderboard_after);

    // Verify leaderboard size decreased by one
    let leaderboard_after = client.get_leaderboard(&crate::types::LeaderboardPeriod::AllTime, &100);
    let size_after = leaderboard_after.len();
    assert_eq!(size_after, size_before - 1);
}

// ── pause state ──────────────────────────────────────────────────────────────

#[test]
fn test_deregister_profile_when_paused() {
    let (env, client, contract_id) = setup();
    let caller = Address::generate(&env);

    // Register a profile with zero balance
    register_default_profile(&env, &client, &caller);

    // Pause the contract
    env.as_contract(&contract_id, || {
        storage::set_pause_flag(&env, crate::types::PauseFlag::All, true);
    });

    // Attempt to deregister while paused
    let result = client.try_deregister_profile(&caller);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));

    // Verify profile still exists (no state changes)
    env.as_contract(&contract_id, || {
        assert!(storage::has_profile(&env, &caller));
    });
}

// ── counter underflow protection ─────────────────────────────────────────────

#[test]
fn test_decrement_total_creators_underflow_protection() {
    let (env, _client, contract_id) = setup();

    // Verify counter starts at zero (no profiles registered)
    let count_before = env.as_contract(&contract_id, || storage::get_total_creators(&env));
    assert_eq!(count_before, 0);

    // Call decrement_total_creators when counter is already zero
    env.as_contract(&contract_id, || {
        storage::decrement_total_creators(&env);
    });

    // Verify counter remains at zero (no underflow)
    let count_after = env.as_contract(&contract_id, || storage::get_total_creators(&env));
    assert_eq!(count_after, 0);
}
