//! Tests for profile query functions (issue #5).

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::errors::ContractError;
use crate::{TipzContract, TipzContractClient};

// ── helpers ──────────────────────────────────────────────────────────────────

fn setup() -> (Env, TipzContractClient<'static>) {
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

    (env, client)
}

fn register_test_profile(env: &Env, client: &TipzContractClient, username: &str) -> Address {
    let caller = Address::generate(env);
    client.register_profile(
        &caller,
        &String::from_str(env, username),
        &String::from_str(env, "Test User"),
        &String::from_str(env, "Test bio"),
        &String::from_str(env, "https://example.com/avatar.png"),
        &String::from_str(env, "test_x"),
    );
    caller
}

// ── get_profile tests ────────────────────────────────────────────────────────

#[test]
fn get_profile_success() {
    let (env, client) = setup();
    let address = register_test_profile(&env, &client, "alice");

    let profile = client.get_profile(&address);

    assert_eq!(profile.owner, address);
    assert_eq!(profile.username, String::from_str(&env, "alice"));
    assert_eq!(profile.display_name, String::from_str(&env, "Test User"));
    assert_eq!(profile.bio, String::from_str(&env, "Test bio"));
    assert_eq!(
        profile.image_url,
        String::from_str(&env, "https://example.com/avatar.png")
    );
    assert_eq!(profile.x_handle, String::from_str(&env, "@test_x"));
    assert_eq!(profile.credit_score, 40);
    assert_eq!(profile.balance, 0);
    assert_eq!(profile.total_tips_received, 0);
    assert_eq!(profile.total_tips_count, 0);
}

#[test]
fn get_profile_not_registered() {
    let (env, client) = setup();
    let unknown_address = Address::generate(&env);

    let result = client.try_get_profile(&unknown_address);

    assert_eq!(result, Err(Ok(ContractError::NotRegistered)));
}

#[test]
fn get_profile_returns_all_fields() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    // Register with all fields populated
    let profile = client.register_profile(
        &caller,
        &String::from_str(&env, "bob"),
        &String::from_str(&env, "Bob Smith"),
        &String::from_str(&env, "I love creating content!"),
        &String::from_str(&env, "https://example.com/bob.jpg"),
        &String::from_str(&env, "bob_twitter"),
    );

    // Retrieve the profile
    let retrieved = client.get_profile(&caller);

    // Verify all fields match
    assert_eq!(retrieved.owner, profile.owner);
    assert_eq!(retrieved.username, profile.username);
    assert_eq!(retrieved.display_name, profile.display_name);
    assert_eq!(retrieved.bio, profile.bio);
    assert_eq!(retrieved.image_url, profile.image_url);
    assert_eq!(retrieved.x_handle, profile.x_handle);
    assert_eq!(retrieved.x_followers, profile.x_followers);
    assert_eq!(retrieved.x_engagement_avg, profile.x_engagement_avg);
    assert_eq!(retrieved.credit_score, profile.credit_score);
    assert_eq!(retrieved.total_tips_received, profile.total_tips_received);
    assert_eq!(retrieved.total_tips_count, profile.total_tips_count);
    assert_eq!(retrieved.balance, profile.balance);
    assert_eq!(retrieved.registered_at, profile.registered_at);
    assert_eq!(retrieved.updated_at, profile.updated_at);
}

// ── get_profile_by_username tests ────────────────────────────────────────────

#[test]
fn get_profile_by_username_success() {
    let (env, client) = setup();
    let address = register_test_profile(&env, &client, "charlie");

    let profile = client.get_profile_by_username(&String::from_str(&env, "charlie"));

    assert_eq!(profile.owner, address);
    assert_eq!(profile.username, String::from_str(&env, "charlie"));
    assert_eq!(profile.display_name, String::from_str(&env, "Test User"));
}

#[test]
fn get_profile_by_username_not_found() {
    let (env, client) = setup();

    let result = client.try_get_profile_by_username(&String::from_str(&env, "nonexistent"));

    assert_eq!(result, Err(Ok(ContractError::NotFound)));
}

#[test]
fn get_profile_by_username_returns_all_fields() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    // Register with all fields populated
    let profile = client.register_profile(
        &caller,
        &String::from_str(&env, "diana"),
        &String::from_str(&env, "Diana Prince"),
        &String::from_str(&env, "Warrior and creator"),
        &String::from_str(&env, "https://example.com/diana.png"),
        &String::from_str(&env, "diana_x"),
    );

    // Retrieve by username
    let retrieved = client.get_profile_by_username(&String::from_str(&env, "diana"));

    // Verify all fields match
    assert_eq!(retrieved.owner, profile.owner);
    assert_eq!(retrieved.username, profile.username);
    assert_eq!(retrieved.display_name, profile.display_name);
    assert_eq!(retrieved.bio, profile.bio);
    assert_eq!(retrieved.image_url, profile.image_url);
    assert_eq!(retrieved.x_handle, profile.x_handle);
    assert_eq!(retrieved.x_followers, profile.x_followers);
    assert_eq!(retrieved.x_engagement_avg, profile.x_engagement_avg);
    assert_eq!(retrieved.credit_score, profile.credit_score);
    assert_eq!(retrieved.total_tips_received, profile.total_tips_received);
    assert_eq!(retrieved.total_tips_count, profile.total_tips_count);
    assert_eq!(retrieved.balance, profile.balance);
    assert_eq!(retrieved.registered_at, profile.registered_at);
    assert_eq!(retrieved.updated_at, profile.updated_at);
}

#[test]
fn get_profile_by_username_multiple_users() {
    let (env, client) = setup();

    // Register multiple users
    let alice_addr = register_test_profile(&env, &client, "alice");
    let bob_addr = register_test_profile(&env, &client, "bob");
    let charlie_addr = register_test_profile(&env, &client, "charlie");

    // Retrieve each by username
    let alice = client.get_profile_by_username(&String::from_str(&env, "alice"));
    let bob = client.get_profile_by_username(&String::from_str(&env, "bob"));
    let charlie = client.get_profile_by_username(&String::from_str(&env, "charlie"));

    // Verify correct addresses
    assert_eq!(alice.owner, alice_addr);
    assert_eq!(bob.owner, bob_addr);
    assert_eq!(charlie.owner, charlie_addr);
}

// ── cross-validation tests ───────────────────────────────────────────────────

#[test]
fn get_profile_and_get_profile_by_username_return_same_data() {
    let (env, client) = setup();
    let address = register_test_profile(&env, &client, "eve");

    let by_address = client.get_profile(&address);
    let by_username = client.get_profile_by_username(&String::from_str(&env, "eve"));

    // Both methods should return identical profiles
    assert_eq!(by_address.owner, by_username.owner);
    assert_eq!(by_address.username, by_username.username);
    assert_eq!(by_address.display_name, by_username.display_name);
    assert_eq!(by_address.bio, by_username.bio);
    assert_eq!(by_address.image_url, by_username.image_url);
    assert_eq!(by_address.x_handle, by_username.x_handle);
    assert_eq!(by_address.credit_score, by_username.credit_score);
    assert_eq!(by_address.balance, by_username.balance);
}
