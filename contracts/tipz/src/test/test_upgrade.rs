//! Upgrade compatibility tests (issue #585).
//!
//! In Soroban's test environment, re-registering the contract at the same
//! address simulates swapping in a new WASM binary.  All instance and
//! persistent storage survives because it is keyed by contract address, not
//! WASM hash — exactly what happens on-chain during `update_current_contract_wasm`.
//!
//! ## Coverage
//! - [`test_upgrade_preserves_profiles`]        — profile data survives upgrade
//! - [`test_upgrade_preserves_leaderboard`]     — leaderboard survives upgrade
//! - [`test_upgrade_preserves_admin_key`]       — admin address survives upgrade
//! - [`test_upgrade_preserves_fee_config`]      — fee bps + collector survive upgrade
//! - [`test_upgrade_preserves_stats`]           — global counters survive upgrade
//! - [`test_upgrade_preserves_paused_state`]    — pause flag survives upgrade
//! - [`test_upgrade_admin_ops_work_after`]      — admin can still call set_fee after upgrade
//! - [`test_upgrade_profile_ops_work_after`]    — users can still update profiles after upgrade
//! - [`test_upgrade_storage_key_compatibility`] — storage keys unchanged between versions

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::storage::DataKey;
use crate::types::{LeaderboardEntry, LeaderboardPeriod, PauseFlag};
use crate::TipzContract;
use crate::TipzContractClient;

const PAUSE_ALL: u32 = PauseFlag::All as u32;

// ── helpers ───────────────────────────────────────────────────────────────────

/// Deploy v1 of the contract, initialise it, and return the full environment.
fn deploy_v1(
) -> (
    Env,
    Address, // contract_id
    Address, // admin
    Address, // fee_collector
    Address, // token_address
) {
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

    (env, contract_id, admin, fee_collector, token_address)
}

/// Register a profile via the contract client.
fn register_profile<'a>(
    env: &Env,
    client: &TipzContractClient<'a>,
    owner: &Address,
    username: &str,
) {
    client.register_profile(
        owner,
        &String::from_str(env, username),
        &String::from_str(env, "Display Name"),
        &String::from_str(env, "A short bio."),
        &String::from_str(env, ""),
        &String::from_str(env, ""),
    );
}

/// Simulate upgrading to v2 by re-registering the same WASM at the same
/// contract address.  In production this corresponds to calling
/// `update_current_contract_wasm(new_wasm_hash)` — all storage is retained.
fn upgrade_to_v2(env: &Env, contract_id: &Address) -> TipzContractClient<'static> {
    // Re-register at the same address; storage is unaffected.
    env.register_contract(Some(contract_id), TipzContract);
    TipzContractClient::new(env, contract_id)
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[test]
fn test_upgrade_preserves_profiles() {
    let (env, contract_id, _admin, _fee_collector, _token) = deploy_v1();
    let client_v1 = TipzContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    register_profile(&env, &client_v1, &alice, "alice");

    let client_v2 = upgrade_to_v2(&env, &contract_id);

    // get_profile returns ProfileWithDeactivation; access inner .profile
    let result = client_v2.get_profile(&alice);
    assert_eq!(result.profile.username, String::from_str(&env, "alice"));
    assert_eq!(result.profile.owner, alice);
}

#[test]
fn test_upgrade_preserves_leaderboard() {
    let (env, contract_id, _admin, _fee_collector, _token) = deploy_v1();

    let creator = Address::generate(&env);

    // Write a leaderboard entry directly into instance storage.
    let mut board: soroban_sdk::Vec<LeaderboardEntry> = soroban_sdk::Vec::new(&env);
    board.push_back(LeaderboardEntry {
        address: creator.clone(),
        username: String::from_str(&env, "bob"),
        amount: 5_000_000,
        credit_score: 40,
    });
    env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .set(&DataKey::Leaderboard(LeaderboardPeriod::AllTime), &board);
    });

    let client_v2 = upgrade_to_v2(&env, &contract_id);

    let leaders = client_v2.get_leaderboard(&LeaderboardPeriod::AllTime, &0);
    assert!(!leaders.is_empty(), "leaderboard must survive upgrade");
    assert_eq!(
        leaders.get(0).unwrap().username,
        String::from_str(&env, "bob")
    );
}

#[test]
fn test_upgrade_preserves_admin_key() {
    let (env, contract_id, admin, _fee_collector, _token) = deploy_v1();

    let client_v2 = upgrade_to_v2(&env, &contract_id);

    // Admin key is in instance storage; verify it by exercising an admin-only op.
    // If the admin key were lost this would return NotAuthorized / NotInitialized.
    client_v2.set_fee(&admin, &300_u32);

    let stats = client_v2.get_stats();
    assert_eq!(stats.fee_bps, 300);
}

#[test]
fn test_upgrade_preserves_fee_config() {
    let (env, contract_id, _admin, fee_collector, _token) = deploy_v1();

    let fee_before: u32 = env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .get(&DataKey::FeePercent)
            .unwrap()
    });
    let collector_before: Address = env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .get(&DataKey::FeeCollector)
            .unwrap()
    });

    upgrade_to_v2(&env, &contract_id);

    let fee_after: u32 = env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .get(&DataKey::FeePercent)
            .unwrap()
    });
    let collector_after: Address = env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .get(&DataKey::FeeCollector)
            .unwrap()
    });

    assert_eq!(fee_before, fee_after);
    assert_eq!(fee_collector, collector_before);
    assert_eq!(collector_before, collector_after);
}

#[test]
fn test_upgrade_preserves_stats() {
    let (env, contract_id, _admin, _fee_collector, _token) = deploy_v1();
    let client_v1 = TipzContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    register_profile(&env, &client_v1, &alice, "alice");
    register_profile(&env, &client_v1, &bob, "bob");

    let stats_before = client_v1.get_stats();

    let client_v2 = upgrade_to_v2(&env, &contract_id);

    let stats_after = client_v2.get_stats();
    assert_eq!(stats_before.total_creators, stats_after.total_creators);
    assert_eq!(stats_before.total_tips_count, stats_after.total_tips_count);
    assert_eq!(stats_before.total_tips_volume, stats_after.total_tips_volume);
    assert_eq!(
        stats_before.total_fees_collected,
        stats_after.total_fees_collected
    );
    assert_eq!(stats_before.fee_bps, stats_after.fee_bps);
}

#[test]
fn test_upgrade_preserves_paused_state() {
    let (env, contract_id, admin, _fee_collector, _token) = deploy_v1();
    let client_v1 = TipzContractClient::new(&env, &contract_id);

    client_v1.pause(&admin, &PAUSE_ALL);
    assert!(client_v1.is_paused(&PAUSE_ALL));

    let client_v2 = upgrade_to_v2(&env, &contract_id);

    assert!(client_v2.is_paused(&PAUSE_ALL), "paused flag must survive upgrade");
}

#[test]
fn test_upgrade_admin_ops_work_after() {
    let (env, contract_id, admin, _fee_collector, _token) = deploy_v1();

    let client_v2 = upgrade_to_v2(&env, &contract_id);

    let new_admin = Address::generate(&env);
    client_v2.set_admin(&admin, &new_admin);

    client_v2.set_fee(&new_admin, &500_u32);
    let stats = client_v2.get_stats();
    assert_eq!(stats.fee_bps, 500);
}

#[test]
fn test_upgrade_profile_ops_work_after() {
    let (env, contract_id, _admin, _fee_collector, _token) = deploy_v1();
    let client_v1 = TipzContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    register_profile(&env, &client_v1, &alice, "alice");

    let client_v2 = upgrade_to_v2(&env, &contract_id);

    client_v2.update_profile(
        &alice,
        &Some(String::from_str(&env, "Alice Updated")),
        &None,
        &None,
        &None,
    );

    // get_profile returns ProfileWithDeactivation; access inner .profile
    let result = client_v2.get_profile(&alice);
    assert_eq!(
        result.profile.display_name,
        String::from_str(&env, "Alice Updated")
    );
}

#[test]
fn test_upgrade_storage_key_compatibility() {
    let (env, contract_id, _admin, _fee_collector, _token) = deploy_v1();
    let client_v1 = TipzContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    register_profile(&env, &client_v1, &alice, "alice");

    let profile_key_before = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .has(&DataKey::Profile(alice.clone()))
    });
    let username_key_before = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .has(&DataKey::UsernameToAddress(String::from_str(&env, "alice")))
    });
    let initialized_before: bool = env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .get(&DataKey::Initialized)
            .unwrap()
    });

    upgrade_to_v2(&env, &contract_id);

    let profile_key_after = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .has(&DataKey::Profile(alice.clone()))
    });
    let username_key_after = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .has(&DataKey::UsernameToAddress(String::from_str(&env, "alice")))
    });
    let initialized_after: bool = env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .get(&DataKey::Initialized)
            .unwrap()
    });

    assert_eq!(profile_key_before, profile_key_after);
    assert_eq!(username_key_before, username_key_after);
    assert_eq!(initialized_before, initialized_after);
}
