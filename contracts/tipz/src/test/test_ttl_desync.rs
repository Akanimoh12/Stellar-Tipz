//! Tests for TTL desync prevention between Profile and UsernameToAddress (issue #233).
//!
//! Covers:
//! - bump_profile_ttl bumps both Profile and UsernameToAddress TTLs together
//! - TTL is bumped on send_tip to creator
//! - TTL is bumped on update_profile
//! - TTL is bumped on withdraw_tips
//! - is_profile_active returns false when UsernameToAddress has expired (orphan)
//! - get_profile_by_username returns NotFound gracefully on orphaned state

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, testutils::storage::Persistent, token, Address, Env, String};

use crate::errors::ContractError;
use crate::storage::{self, DataKey, PROFILE_TTL_MAX_LEDGERS};
use crate::types::Profile;
use crate::{TipzContract, TipzContractClient};

// ── helpers ───────────────────────────────────────────────────────────────────

fn setup() -> (Env, TipzContractClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200_u32, &token_address);

    let creator = Address::generate(&env);
    client.register_profile(
        &creator,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    let tipper = Address::generate(&env);
    token_admin_client.mint(&tipper, &100_000_000_000);
    // Mint to contract so withdrawals work
    token_admin_client.mint(&contract_id, &100_000_000_000);

    (env, client, contract_id, creator, tipper)
}

// ── bump_profile_ttl bumps both entries ───────────────────────────────────────

#[test]
fn test_bump_profile_ttl_extends_both_entries() {
    let (env, _client, contract_id, creator, _tipper) = setup();

    env.as_contract(&contract_id, || {
        let profile: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(creator.clone()))
            .unwrap();
        let username = profile.username.clone();

        storage::bump_profile_ttl(&env, &creator);
        storage::bump_username_ttl(&env, &username);

        let profile_ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::Profile(creator.clone()));
        assert_eq!(profile_ttl, PROFILE_TTL_MAX_LEDGERS);

        let username_ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::UsernameToAddress(username));
        assert_eq!(username_ttl, PROFILE_TTL_MAX_LEDGERS);
    });
}

// ── TTL bumped on send_tip ────────────────────────────────────────────────────

#[test]
fn test_send_tip_bumps_creator_profile_ttl() {
    let (env, client, contract_id, creator, tipper) = setup();

    let msg = String::from_str(&env, "great work");
    client.send_tip(&tipper, &creator, &10_000_000, &msg);

    env.as_contract(&contract_id, || {
        let profile_key = DataKey::Profile(creator.clone());
        let ttl = env.storage().persistent().get_ttl(&profile_key);
        assert_eq!(ttl, PROFILE_TTL_MAX_LEDGERS);

        let profile: Profile = env.storage().persistent().get(&profile_key).unwrap();
        let username_ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::UsernameToAddress(profile.username));
        assert_eq!(username_ttl, PROFILE_TTL_MAX_LEDGERS);
    });
}

// ── TTL bumped on update_profile ──────────────────────────────────────────────

#[test]
fn test_update_profile_bumps_ttl() {
    let (env, client, contract_id, creator, _tipper) = setup();

    client.update_profile(
        &creator,
        &Some(String::from_str(&env, "Alice Updated")),
        &None,
        &None,
        &None,
    );

    env.as_contract(&contract_id, || {
        let profile_key = DataKey::Profile(creator.clone());
        let ttl = env.storage().persistent().get_ttl(&profile_key);
        assert_eq!(ttl, PROFILE_TTL_MAX_LEDGERS);

        let profile: Profile = env.storage().persistent().get(&profile_key).unwrap();
        let username_ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::UsernameToAddress(profile.username));
        assert_eq!(username_ttl, PROFILE_TTL_MAX_LEDGERS);
    });
}

// ── TTL bumped on withdraw_tips ───────────────────────────────────────────────

#[test]
fn test_withdraw_bumps_profile_ttl() {
    let (env, client, contract_id, creator, tipper) = setup();

    // Give the creator a balance first
    let msg = String::from_str(&env, "tip");
    client.send_tip(&tipper, &creator, &50_000_000, &msg);

    client.withdraw_tips(&creator, &10_000_000);

    env.as_contract(&contract_id, || {
        let profile_key = DataKey::Profile(creator.clone());
        let ttl = env.storage().persistent().get_ttl(&profile_key);
        assert_eq!(ttl, PROFILE_TTL_MAX_LEDGERS);

        let profile: Profile = env.storage().persistent().get(&profile_key).unwrap();
        let username_ttl = env
            .storage()
            .persistent()
            .get_ttl(&DataKey::UsernameToAddress(profile.username));
        assert_eq!(username_ttl, PROFILE_TTL_MAX_LEDGERS);
    });
}

// ── is_profile_active detects orphaned state ──────────────────────────────────

#[test]
fn test_is_profile_active_true_when_both_exist() {
    let (env, _client, contract_id, creator, _tipper) = setup();

    env.as_contract(&contract_id, || {
        assert!(storage::is_profile_active(&env, &creator));
    });
}

#[test]
fn test_is_profile_active_false_when_profile_absent() {
    let (env, _client, contract_id, _creator, _tipper) = setup();
    let stranger = Address::generate(&env);

    env.as_contract(&contract_id, || {
        assert!(!storage::is_profile_active(&env, &stranger));
    });
}

#[test]
fn test_is_profile_active_false_when_username_mapping_absent() {
    let (env, _client, contract_id, creator, _tipper) = setup();

    // Simulate orphan: remove the UsernameToAddress entry while Profile remains.
    env.as_contract(&contract_id, || {
        let profile: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(creator.clone()))
            .unwrap();
        env.storage()
            .persistent()
            .remove(&DataKey::UsernameToAddress(profile.username));

        assert!(!storage::is_profile_active(&env, &creator));
    });
}

// ── get_profile_by_username returns NotFound on orphaned state ────────────────

#[test]
fn test_get_profile_by_username_returns_not_found_on_orphan() {
    let (env, client, contract_id, creator, _tipper) = setup();

    // Simulate orphan: remove the UsernameToAddress entry.
    env.as_contract(&contract_id, || {
        let profile: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(creator.clone()))
            .unwrap();
        env.storage()
            .persistent()
            .remove(&DataKey::UsernameToAddress(profile.username));
    });

    let result = client.try_get_profile_by_username(&String::from_str(&env, "alice"));
    assert_eq!(result, Err(Ok(ContractError::NotFound)));
}

#[test]
fn test_get_profile_by_username_succeeds_when_active() {
    let (env, client, _contract_id, creator, _tipper) = setup();

    let profile = client.get_profile_by_username(&String::from_str(&env, "alice"));
    assert_eq!(profile.owner, creator);
}
