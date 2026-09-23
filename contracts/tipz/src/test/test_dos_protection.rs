//! Tests for contract storage denial-of-service protection.
//!
//! Covers:
//! - Maximum profile count enforcement
//! - Message length bounding
//! - Username/display name length enforcement
//! - Registration rate limiting
//! - Leaderboard size bounding
//! - Cleanup mechanism for inactive profiles

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Env, String, Vec,
};

use crate::errors::ContractError;
#[allow(unused_imports)]
use std::format;
use crate::storage::{self, DataKey};
use crate::types;
use crate::{TipzContract, TipzContractClient};

fn setup() -> (Env, Address, TipzContractClient<'static>) {
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

    (env, contract_id, client)
}

/// Setup that also returns the token admin client for minting
fn setup_with_token() -> (Env, Address, TipzContractClient<'static>, token::StellarAssetClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200_u32, &token_address);

    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    (env, contract_id, client, token_admin_client)
}

fn setup_with_id() -> (Env, Address, TipzContractClient<'static>) {
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

    (env, contract_id, client)
}

fn register_user_full(
    env: &Env,
    client: &TipzContractClient<'static>,
    caller: &Address,
    username: &str,
    display_name: &str,
    x_handle: &str,
) {
    client.register_profile(
        caller,
        &String::from_str(env, username),
        &String::from_str(env, display_name),
        &String::from_str(env, "A short bio."),
        &String::from_str(env, "https://example.com/avatar.png"),
        &String::from_str(env, x_handle),
    );
}

fn register_user(
    env: &Env,
    client: &TipzContractClient<'static>,
    caller: &Address,
    username: &str,
) {
    register_user_full(env, client, caller, username, "Display Name", "x");
}

fn make_long_str(env: &Env, c: char, len: usize) -> String {
    let mut buf = [0u8; 4];
    let encoded = c.encode_utf8(&mut buf);
    let mut repeated = std::string::String::new();
    for _ in 0..len {
        repeated.push_str(encoded);
    }
    String::from_str(env, &repeated)
}

// ═══════════════════════════════════════════════════════════════════════════
// MAX PROFILES ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_max_profiles_enforced() {
    let (env, contract_id, client) = setup_with_id();

    let alice = Address::generate(&env);

    // Set total_creators to MAX_PROFILES via storage to simulate limit hit
    env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .set(&DataKey::TotalCreators, &types::MAX_PROFILES);
    });

    // Now try to register — should fail because we're at the cap
    let result = client.try_register_profile(
        &alice,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::MaxProfilesReached)));
}

#[test]
fn test_max_profiles_not_reached_allows_registration() {
    let (env, _contract_id, client) = setup();

    let addr = Address::generate(&env);
    let result = client.try_register_profile(
        &addr,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert!(result.is_ok());
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE LENGTH BOUNDING
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_message_length_bounded() {
    let (env, _contract_id, client, token_admin_client) = setup_with_token();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    register_user(&env, &client, &alice, "alice");
    register_user(&env, &client, &bob, "bob");

    token_admin_client.mint(&alice, &10_000_000_000);

    // Message exactly at limit should pass
    let valid_msg = make_long_str(&env, 'a', types::MAX_MESSAGE_LENGTH as usize);
    let result = client.try_send_tip(
        &alice,
        &bob,
        &2_000_000_i128,
        &valid_msg,
        &false,
        &false,
    );
    assert!(result.is_ok());

    // Message exceeding limit should fail
    let long_msg = make_long_str(&env, 'a', (types::MAX_MESSAGE_LENGTH + 1) as usize);
    let result2 = client.try_send_tip(
        &alice,
        &bob,
        &2_000_000_i128,
        &long_msg,
        &false,
        &false,
    );
    assert_eq!(result2, Err(Ok(ContractError::MessageTooLong)));
}

// ═══════════════════════════════════════════════════════════════════════════
// USERNAME LENGTH ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_username_length_bounded() {
    let (env, _contract_id, client) = setup();

    // Username at max length should pass
    let caller1 = Address::generate(&env);
    let max_username = make_long_str(&env, 'a', types::MAX_USERNAME_LENGTH as usize);
    let result = client.try_register_profile(
        &caller1,
        &max_username,
        &String::from_str(&env, "Display"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert!(result.is_ok(), "Max length username {} should be accepted", types::MAX_USERNAME_LENGTH);

    // Too long should fail
    let caller2 = Address::generate(&env);
    let long_username = make_long_str(&env, 'a', (types::MAX_USERNAME_LENGTH + 1) as usize);
    let result2 = client.try_register_profile(
        &caller2,
        &long_username,
        &String::from_str(&env, "Display"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result2, Err(Ok(ContractError::InvalidUsername)));
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPLAY NAME LENGTH ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_display_name_length_bounded() {
    let (env, _contract_id, client) = setup();
    let caller = Address::generate(&env);

    // Display name at max length should pass
    let max_name = make_long_str(&env, 'D', types::MAX_DISPLAY_NAME_LENGTH as usize);
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "alice"),
        &max_name,
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert!(result.is_ok());

    // Too long should fail
    let caller2 = Address::generate(&env);
    let long_name = make_long_str(&env, 'D', (types::MAX_DISPLAY_NAME_LENGTH + 1) as usize);
    let result2 = client.try_register_profile(
        &caller2,
        &String::from_str(&env, "bob"),
        &long_name,
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result2, Err(Ok(ContractError::InvalidDisplayName)));
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRATION RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_registration_rate_limiting() {
    let (env, contract_id, client) = setup();

    // Rate limit is per-address: validate_registration_rate_limit uses
    // DataKey::RateLimit(address), so each address gets its own counter.
    // Register the same address MAX_REGISTRATIONS_PER_WINDOW times using
    // a fresh address each round (since registration also checks
    // AlreadyRegistered, we need distinct addresses per call but the
    // counter is per-address, so we test with one address that hits the
    // per-address limit by calling with new addresses that share a rate
    // limit bucket — actually the limit IS per-address, so we use the
    // same address by registering and deregistering, or we accept that
    // the rate limit is per-address and just verify the counter works.
    //
    // The simplest correct test: register a single address once (count=1),
    // then try to register more than MAX_REGISTRATIONS_PER_WINDOW times
    // in the same window — but each attempt needs a fresh address since
    // AlreadyRegistered blocks reuse.  Instead, we test that after
    // MAX_REGISTRATIONS_PER_WINDOW registrations in the same window, the
    // next new-address registration that happens to share the same
    // rate-limit bucket fails.
    //
    // Actually, each address has its OWN counter, so the real behavior is:
    // a single address can register at most MAX_REGISTRATIONS_PER_WINDOW
    // times before being rate-limited.  We test that directly.

    // Use a single caller address — but register_profile checks
    // AlreadyRegistered, so the same address can't register twice.
    // Therefore, the per-address counter only ever reaches 1 for any
    // address that successfully registers.  The rate limit effectively
    // means: each unique address can register once per window.
    //
    // To actually hit the rate limit, we need to register
    // MAX_REGISTRATIONS_PER_WINDOW distinct addresses (each increments
    // its own counter to 1), then verify the next distinct address can
    // still register (since it has its own bucket).  This means the
    // rate limit is not global — it's per-address.
    //
    // The test below verifies the per-address counter works by using a
    // trick: we directly manipulate storage to set a specific address's
    // counter to MAX, then verify that address is rate-limited.

    let caller = Address::generate(&env);

    // Directly set the rate limit status for this caller to MAX
    env.as_contract(&contract_id, || {
        storage::set_rate_limit_status(
            &env,
            &caller,
            &crate::types::RateLimitStatus {
                count: types::MAX_REGISTRATIONS_PER_WINDOW,
                last_op_time: env.ledger().timestamp(),
            },
        );
    });

    // This address should now be rate-limited
    let result = client.try_register_profile(
        &caller,
        &String::from_str(&env, "rate_limited"),
        &String::from_str(&env, "Rate Limited"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert_eq!(result, Err(Ok(ContractError::RateLimitExceeded)));

    // A fresh address with no prior count should succeed
    let fresh = Address::generate(&env);
    let result2 = client.try_register_profile(
        &fresh,
        &String::from_str(&env, "fresh_ok"),
        &String::from_str(&env, "Fresh"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert!(result2.is_ok());
}

#[test]
fn test_registration_rate_limit_resets_after_window() {
    let (env, _contract_id, client) = setup();

    // Register up to the rate limit
    for i in 0..types::MAX_REGISTRATIONS_PER_WINDOW {
        let addr = Address::generate(&env);
        let username = format!("user{}", i);
        client.register_profile(
            &addr,
            &String::from_str(&env, &username),
            &String::from_str(&env, "Display"),
            &String::from_str(&env, "Bio"),
            &String::from_str(&env, "https://example.com/avatar.png"),
            &String::from_str(&env, ""),
        );
    }

    // Advance time past the rate limit window
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + types::REGISTRATION_RATE_WINDOW_SECS + 1);

    // Registration should succeed again
    let extra = Address::generate(&env);
    let result = client.try_register_profile(
        &extra,
        &String::from_str(&env, "extra"),
        &String::from_str(&env, "Extra"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    assert!(result.is_ok());
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADERBOARD SIZE BOUNDED
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_leaderboard_size_bounded() {
    let (env, contract_id, client, token_admin_client) = setup_with_token();

    let max_lb = crate::leaderboard::MAX_LEADERBOARD_SIZE;

    // Build leaderboard entries in storage directly that exceed the cap
    env.as_contract(&contract_id, || {
        let mut entries: soroban_sdk::Vec<crate::types::LeaderboardEntry> =
            soroban_sdk::Vec::new(&env);
        for i in 0..(max_lb + 5) {
            entries.push_back(crate::types::LeaderboardEntry {
                address: Address::generate(&env),
                username: String::from_str(&env, "user"),
                amount: (i as i128 + 1) * 100,
                credit_score: 40,
            });
        }
        storage::set_leaderboard(&env, crate::types::LeaderboardPeriod::AllTime, &entries);
    });

    // get_leaderboard returns all entries when limit is 0
    let lb = client.get_leaderboard(&crate::types::LeaderboardPeriod::AllTime, &0);
    assert_eq!(lb.len(), max_lb + 5);

    // Create a user and trigger a leaderboard update
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);
    register_user(&env, &client, &tipper, "tipperx");
    register_user(&env, &client, &creator, "creatorx");

    token_admin_client.mint(&tipper, &10_000_000_000);

    // Send a tip to trigger leaderboard update with cap enforcement
    client.send_tip(
        &tipper,
        &creator,
        &100_000_000_i128,
        &String::from_str(&env, "big tip"),
        &false,
        &false,
    );

    // After update, the leaderboard should be capped at MAX_LEADERBOARD_SIZE
    // (entries that fall off the bottom should be evicted)
    env.as_contract(&contract_id, || {
        let lb_after = storage::get_leaderboard(&env, crate::types::LeaderboardPeriod::AllTime);
        assert_eq!(lb_after.len(), max_lb);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP MECHANISM FOR INACTIVE PROFILES
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_cleanup_inactive_profile() {
    let (env, contract_id, client) = setup_with_id();
    let config = client.get_config();
    let admin = config.admin;

    let creator = Address::generate(&env);
    register_user(&env, &client, &creator, "creator1");

    // Set creator_last_active for inactivity check
    let registration_time = env.ledger().timestamp();
    env.as_contract(&contract_id, || {
        storage::set_creator_last_active(&env, &creator, registration_time);
    });

    // Profile should not be eligible for cleanup yet
    assert!(!client.is_profile_inactive_eligible(&creator));

    // Advance time past the inactivity threshold
    env.ledger().set_timestamp(
        env.ledger().timestamp() + types::INACTIVE_PROFILE_THRESHOLD_SECS + 1,
    );

    // Now the profile should be eligible (no tips were ever received, no balance)
    assert!(client.is_profile_inactive_eligible(&creator));

    // Cleanup should succeed
    let result = client.try_cleanup_inactive_profile(&admin, &creator);
    assert!(result.is_ok());

    // Profile should be gone
    let get_result = client.try_get_profile(&creator);
    assert_eq!(get_result, Err(Ok(ContractError::NotRegistered)));
}

#[test]
fn test_cleanup_inactive_profile_with_balance_rejected() {
    let (env, _contract_id, client, token_admin_client) = setup_with_token();
    let config = client.get_config();
    let admin = config.admin;

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);
    register_user(&env, &client, &creator, "creator1");
    register_user(&env, &client, &tipper, "tipper1");

    token_admin_client.mint(&tipper, &10_000_000_000);

    // Send a tip so creator has balance
    client.send_tip(
        &tipper,
        &creator,
        &2_000_000_i128,
        &String::from_str(&env, "tip"),
        &false,
        &false,
    );

    // Advance time past the inactivity threshold
    env.ledger().set_timestamp(
        env.ledger().timestamp() + types::INACTIVE_PROFILE_THRESHOLD_SECS + 1,
    );

    // Profile should NOT be eligible for cleanup (has balance)
    assert!(!client.is_profile_inactive_eligible(&creator));

    // Cleanup should fail
    let result = client.try_cleanup_inactive_profile(&admin, &creator);
    assert_eq!(result, Err(Ok(ContractError::ProfileInactive)));
}

#[test]
fn test_cleanup_inactive_profile_non_admin_rejected() {
    let (env, _contract_id, client) = setup();

    let creator = Address::generate(&env);
    let non_admin = Address::generate(&env);
    register_user(&env, &client, &creator, "creator1");

    // Advance time past the inactivity threshold
    env.ledger().set_timestamp(
        env.ledger().timestamp() + types::INACTIVE_PROFILE_THRESHOLD_SECS + 1,
    );

    // Non-admin should not be able to clean up
    let result = client.try_cleanup_inactive_profile(&non_admin, &creator);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_cleanup_inactive_profiles_batch() {
    let (env, _contract_id, client) = setup();
    let config = client.get_config();
    let admin = config.admin;

    // Register multiple profiles
    let mut targets: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(&env);
    for i in 0..5 {
        let addr = Address::generate(&env);
        let username = format!("user{}", i);
        register_user(&env, &client, &addr, &username);
        targets.push_back(addr);
    }

    // Advance time past the inactivity threshold
    env.ledger().set_timestamp(
        env.ledger().timestamp() + types::INACTIVE_PROFILE_THRESHOLD_SECS + 1,
    );

    // Batch cleanup
    let cleaned = client.try_cleanup_inactive_profiles(&admin, &targets, &5);
    assert!(cleaned.is_ok());
    assert_eq!(cleaned.unwrap().unwrap(), 5);

    // All profiles should be gone
    for i in 0..targets.len() {
        let target = targets.get(i).unwrap();
        let get_result = client.try_get_profile(&target);
        assert_eq!(get_result, Err(Ok(ContractError::NotRegistered)));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE COST ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_storage_cost_constants_are_reasonable() {
    assert!(types::MAX_PROFILES > 0 && types::MAX_PROFILES <= 100_000);
    assert!(types::MAX_MESSAGE_LENGTH > 0 && types::MAX_MESSAGE_LENGTH <= 1000);
    assert!(types::MAX_USERNAME_LENGTH > 0 && types::MAX_USERNAME_LENGTH <= 64);
    assert!(types::MAX_DISPLAY_NAME_LENGTH > 0 && types::MAX_DISPLAY_NAME_LENGTH <= 128);
    assert!(types::MAX_BIO_LENGTH > 0 && types::MAX_BIO_LENGTH <= 1000);
    assert!(types::INACTIVE_PROFILE_THRESHOLD_SECS >= 30 * 24 * 3600);
    assert!(types::MAX_REGISTRATIONS_PER_WINDOW > 0 && types::MAX_REGISTRATIONS_PER_WINDOW <= 100);
    assert!(types::REGISTRATION_RATE_WINDOW_SECS > 0);
    assert!(types::STORAGE_COST_CEILING > 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE SIZE LIMIT ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_subscriptions_at_cap_accepted() {
    let (env, _contract_id, client, sac) = setup_with_token();
    let tipper = Address::generate(&env);
    sac.mint(&tipper, &100_000_000_000);

    for i in 0..types::MAX_SUBSCRIPTIONS_PER_SUBSCRIBER {
        let creator = Address::generate(&env);
        let username = soroban_sdk::String::from_str(&env, &format!("user{}", i));
        let display = soroban_sdk::String::from_str(&env, &format!("User {}", i));
        client.register_profile(
            &creator,
            &username,
            &display,
            &String::from_str(&env, ""),
            &String::from_str(&env, ""),
            &String::from_str(&env, ""),
        );
        client.create_subscription(&tipper, &creator, &1_000_000, &7_u32);
    }

    let subs = client.get_subscriptions(&tipper);
    assert_eq!(subs.len(), types::MAX_SUBSCRIPTIONS_PER_SUBSCRIBER);
}

#[test]
fn test_subscriptions_over_cap_rejected() {
    let (env, _contract_id, client, sac) = setup_with_token();
    let tipper = Address::generate(&env);
    sac.mint(&tipper, &100_000_000_000);

    for i in 0..types::MAX_SUBSCRIPTIONS_PER_SUBSCRIBER {
        let creator = Address::generate(&env);
        let username = soroban_sdk::String::from_str(&env, &format!("user{}", i));
        let display = soroban_sdk::String::from_str(&env, &format!("User {}", i));
        client.register_profile(
            &creator,
            &username,
            &display,
            &String::from_str(&env, ""),
            &String::from_str(&env, ""),
            &String::from_str(&env, ""),
        );
        client.create_subscription(&tipper, &creator, &1_000_000, &7_u32);
    }

    let extra_creator = Address::generate(&env);
    client.register_profile(
        &extra_creator,
        &String::from_str(&env, "extra"),
        &String::from_str(&env, "Extra"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );
    let result = client.try_create_subscription(&tipper, &extra_creator, &1_000_000, &7_u32);
    assert_eq!(result, Err(Ok(ContractError::StorageLimitExceeded)));
}
