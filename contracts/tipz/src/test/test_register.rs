//! Tests for profile registration (issue #1).

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

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let native_token = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200_u32, &native_token);

    (env, client)
}

fn default_strings(env: &Env) -> (String, String, String, String, String) {
    (
        String::from_str(env, "alice"),
        String::from_str(env, "Alice Smith"),
        String::from_str(env, "Hello, I make content!"),
        String::from_str(env, "https://example.com/avatar.png"),
        String::from_str(env, "alice_x"),
    )
}

// ── success path ─────────────────────────────────────────────────────────────

#[test]
fn register_profile_success() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    let (username, display_name, bio, image_url, x_handle) = default_strings(&env);

    let profile = client.register_profile(
        &caller,
        &username,
        &display_name,
        &bio,
        &image_url,
        &x_handle,
    );

    assert_eq!(profile.owner, caller);
    assert_eq!(profile.username, username);
    assert_eq!(profile.display_name, display_name);
    assert_eq!(profile.bio, bio);
    assert_eq!(profile.image_url, image_url);
    assert_eq!(profile.x_handle, x_handle);
    assert_eq!(profile.credit_score, 40);
    assert_eq!(profile.balance, 0);
    assert_eq!(profile.total_tips_received, 0);
    assert_eq!(profile.total_tips_count, 0);
}

#[test]
fn register_profile_sets_timestamps() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    let (username, display_name, bio, image_url, x_handle) = default_strings(&env);

    let profile = client.register_profile(
        &caller,
        &username,
        &display_name,
        &bio,
        &image_url,
        &x_handle,
    );

    assert_eq!(profile.registered_at, env.ledger().timestamp());
    assert_eq!(profile.updated_at, env.ledger().timestamp());
}

#[test]
fn register_profile_two_users_succeed() {
    let (env, client) = setup();

    let caller1 = Address::generate(&env);
    let caller2 = Address::generate(&env);

    // Both registrations must succeed with distinct usernames.
    client.register_profile(
        &caller1,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    client.register_profile(
        &caller2,
        &String::from_str(&env, "bob"),
        &String::from_str(&env, "Bob"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
}

// ── not-initialized guard ─────────────────────────────────────────────────────

#[test]
fn register_profile_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let caller = Address::generate(&env);
    let (username, display_name, bio, image_url, x_handle) = default_strings(&env);

    let result = client.try_register_profile(
        &caller,
        &username,
        &display_name,
        &bio,
        &image_url,
        &x_handle,
    );

    assert_eq!(result, Err(Ok(ContractError::NotInitialized)));
}

// ── duplicate checks ──────────────────────────────────────────────────────────

#[test]
fn register_profile_already_registered() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    let (username, display_name, bio, image_url, x_handle) = default_strings(&env);

    // First registration succeeds.
    client.register_profile(
        &caller,
        &username,
        &display_name,
        &bio,
        &image_url,
        &x_handle,
    );

    // Second registration with the same address must fail.
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "alice2"),
        &display_name,
        &bio,
        &image_url,
        &x_handle,
    );

    assert_eq!(result, Err(Ok(ContractError::AlreadyRegistered)));
}

#[test]
fn register_profile_username_taken() {
    let (env, client) = setup();
    let caller1 = Address::generate(&env);
    let caller2 = Address::generate(&env);
    let (username, display_name, bio, image_url, x_handle) = default_strings(&env);

    // First user claims the username.
    client.register_profile(
        &caller1,
        &username,
        &display_name,
        &bio,
        &image_url,
        &x_handle,
    );

    // Second user tries the same username.
    let result = client.try_register_profile(
        &caller2,
        &username,
        &display_name,
        &bio,
        &image_url,
        &x_handle,
    );

    assert_eq!(result, Err(Ok(ContractError::UsernameTaken)));
}

// ── username validation ───────────────────────────────────────────────────────

#[test]
fn register_profile_username_too_short() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    // 2-character username is below the 3-character minimum.
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "ab"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidUsername)));
}

#[test]
fn register_profile_username_too_long() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    // 33-character username exceeds the 32-character maximum.
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "abcdefghijklmnopqrstuvwxyz1234567"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidUsername)));
}

#[test]
fn register_profile_username_starts_with_digit() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "1alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidUsername)));
}

#[test]
fn register_profile_username_starts_with_underscore() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "_alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidUsername)));
}

#[test]
fn register_profile_username_uppercase_rejected() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidUsername)));
}

#[test]
fn register_profile_username_with_hyphen_rejected() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "ali-ce"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidUsername)));
}

#[test]
fn register_profile_username_minimum_length_accepted() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    // 3-character username is the minimum — must succeed.
    let profile = client.register_profile(
        &caller,
        &String::from_str(&env, "abc"),
        &String::from_str(&env, "ABC"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(profile.username, String::from_str(&env, "abc"));
}

#[test]
fn register_profile_username_maximum_length_accepted() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    // 32-character username is the maximum — must succeed.
    let profile = client.register_profile(
        &caller,
        &String::from_str(&env, "abcdefghijklmnopqrstuvwxyz123456"),
        &String::from_str(&env, "Full Name"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(
        profile.username,
        String::from_str(&env, "abcdefghijklmnopqrstuvwxyz123456")
    );
}

#[test]
fn register_profile_username_underscore_allowed_after_letter() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    let profile = client.register_profile(
        &caller,
        &String::from_str(&env, "alice_bob"),
        &String::from_str(&env, "Alice Bob"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(profile.username, String::from_str(&env, "alice_bob"));
}

// ── display name validation ───────────────────────────────────────────────────

#[test]
fn register_profile_display_name_empty() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidDisplayName)));
}

#[test]
fn register_profile_display_name_too_long() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    // 65 characters — one over the 64-character limit.
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "alice"),
        // 26 + 26 + 13 = 65 chars
        &String::from_str(
            &env,
            "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm",
        ),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidDisplayName)));
}

#[test]
fn register_profile_display_name_max_length_accepted() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    // 64 characters — at the limit, must succeed.
    let profile = client.register_profile(
        &caller,
        &String::from_str(&env, "alice"),
        // 26 + 26 + 12 = 64 chars
        &String::from_str(
            &env,
            "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijkl",
        ),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(profile.display_name.len(), 64);
}

// ── bio validation ────────────────────────────────────────────────────────────

#[test]
fn register_profile_bio_too_long() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    // 281 characters — one over the 280-character maximum.
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(
            &env,
            // 281 'a' characters
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::MessageTooLong)));
}

#[test]
fn register_profile_bio_max_length_accepted() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    // Exactly 280 characters — at the limit, must succeed.
    let profile = client.register_profile(
        &caller,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(
            &env,
            // 280 'a' characters
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(profile.bio.len(), 280);
}

// ── image URL validation ──────────────────────────────────────────────────────

#[test]
fn register_profile_image_url_too_long() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    // 257 characters — one over the 256-character maximum.
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(
            &env,
            // "https://example.com/" (20 chars) + 237 'a' chars = 257 total
            "https://example.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidImageUrl)));
}

#[test]
fn register_profile_image_url_max_length_accepted() {
    let (env, client) = setup();
    let caller = Address::generate(&env);
    // Exactly 256 characters — at the limit, must succeed.
    let profile = client.register_profile(
        &caller,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(
            &env,
            // "https://example.com/" (20 chars) + 236 'a' chars = 256 total
            "https://example.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ),
        &String::from_str(&env, ""),
    );
    assert_eq!(profile.image_url.len(), 256);
}
