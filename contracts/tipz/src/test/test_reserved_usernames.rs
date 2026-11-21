//! Tests for reserved username blocking at registration (issue #1600).
//!
//! Verifies that:
//! - Every name in [`crate::types::RESERVED_USERNAMES`] is rejected at registration
//! - The rejection returns [`ContractError::ReservedUsername`]
//! - Non-reserved usernames that are otherwise valid are still accepted
//! - Usernames that are merely *prefixes* or *suffixes* of a reserved word are allowed
//! - The `is_reserved_username` helper function works in isolation
//! - The check integrates correctly end-to-end via the contract client

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::errors::ContractError;
use crate::types::RESERVED_USERNAMES;
use crate::validation::is_reserved_username;
use crate::{TipzContract, TipzContractClient};

// ── helpers ───────────────────────────────────────────────────────────────────

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

/// Register a profile with the given username, filling in dummy values for the rest.
fn try_register(
    env: &Env,
    client: &TipzContractClient,
    username: &str,
) -> Result<crate::types::Profile, crate::errors::ContractError> {
    let caller = Address::generate(env);
    client.try_register_profile(
        &caller,
        &String::from_str(env, username),
        &String::from_str(env, "Display Name"),
        &String::from_str(env, ""),
        &String::from_str(env, ""),
        &String::from_str(env, ""),
    )
}

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for is_reserved_username()
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn reserved_fn_rejects_admin() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "admin")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_support() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "support")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_tipz() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "tipz")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_api() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "api")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_www() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "www")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_help() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "help")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_info() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "info")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_contact() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "contact")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_settings() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "settings")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_security() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "security")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_dashboard() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "dashboard")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_null() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "null")),
        Err(ContractError::ReservedUsername)
    );
}

#[test]
fn reserved_fn_rejects_anonymous() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "anonymous")),
        Err(ContractError::ReservedUsername)
    );
}

// ── Non-reserved names are allowed ───────────────────────────────────────────

#[test]
fn reserved_fn_allows_alice() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "alice")),
        Ok(())
    );
}

#[test]
fn reserved_fn_allows_regular_username() {
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "creator42")),
        Ok(())
    );
}

#[test]
fn reserved_fn_allows_prefix_of_reserved() {
    // "adm" is NOT in the reserved list even though "admin" is.
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "adm")),
        Ok(())
    );
}

#[test]
fn reserved_fn_allows_suffix_of_reserved() {
    // "dmin" is NOT in the reserved list even though "admin" is.
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "dmin")),
        Ok(())
    );
}

#[test]
fn reserved_fn_allows_reserved_as_substring() {
    // A username that *contains* "admin" but isn't exactly "admin" is allowed.
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "myadmin")),
        Ok(())
    );
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "admins")),
        Ok(())
    );
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "super_admin")),
        Ok(())
    );
}

#[test]
fn reserved_fn_allows_tipz_with_numbers() {
    // "tipz1" is NOT the same as "tipz".
    let env = Env::default();
    assert_eq!(
        is_reserved_username(&String::from_str(&env, "tipz1")),
        Ok(())
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Integration tests — reserved names are blocked via the full contract call
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn register_reserved_admin_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "admin");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_support_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "support");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_tipz_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "tipz");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_api_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "api");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_help_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "help");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_info_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "info");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_mail_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "mail");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_root_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "root");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_system_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "system");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_moderator_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "moderator");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_mod_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "mod");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_official_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "official");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_staff_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "staff");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_team_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "team");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_security_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "security");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_abuse_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "abuse");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_billing_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "billing");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_login_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "login");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_register_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "register");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_signup_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "signup");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_settings_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "settings");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_dashboard_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "dashboard");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

#[test]
fn register_reserved_notifications_fails() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "notifications");
    assert_eq!(result, Err(ContractError::ReservedUsername));
}

// ── Non-reserved names are accepted end-to-end ───────────────────────────────

#[test]
fn register_non_reserved_alice_succeeds() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "alice");
    assert!(result.is_ok(), "expected Ok, got {:?}", result);
}

#[test]
fn register_non_reserved_creator42_succeeds() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "creator42");
    assert!(result.is_ok(), "expected Ok, got {:?}", result);
}

#[test]
fn register_name_containing_reserved_as_substring_succeeds() {
    let (env, client) = setup();
    // "myadmin" contains "admin" but is not exactly "admin".
    let result = try_register(&env, &client, "myadmin");
    assert!(result.is_ok(), "expected Ok, got {:?}", result);
}

#[test]
fn register_name_with_reserved_prefix_suffix_succeeds() {
    let (env, client) = setup();
    let result = try_register(&env, &client, "admins");
    assert!(result.is_ok(), "'admins' should be allowed");
    let result2 = try_register(&env, &client, "tipzapp2");
    assert!(result2.is_ok(), "'tipzapp2' should be allowed");
}

// ═══════════════════════════════════════════════════════════════════════════
// Exhaustive check: every entry in RESERVED_USERNAMES is blocked
// ═══════════════════════════════════════════════════════════════════════════

/// Validate that is_reserved_username rejects every entry in the static list.
#[test]
fn all_reserved_names_are_rejected_by_helper() {
    let env = Env::default();
    for &name in RESERVED_USERNAMES {
        assert_eq!(
            is_reserved_username(&String::from_str(&env, name)),
            Err(ContractError::ReservedUsername),
            "Expected {:?} to be rejected as reserved",
            name
        );
    }
}

/// Validate that every entry in RESERVED_USERNAMES is blocked end-to-end.
#[test]
fn all_reserved_names_are_rejected_at_registration() {
    // Use a single setup instance and iterate; each try_register uses a fresh caller.
    let (env, client) = setup();
    for &name in RESERVED_USERNAMES {
        // Some reserved names (e.g. "me", "www", "sys") are too short or fail other
        // username validations.  We only care about the ReservedUsername error here,
        // so we accept any Err result for very short names and require ReservedUsername
        // for names that pass format validation.
        let name_bytes = name.as_bytes();
        let too_short = name_bytes.len() < 3;
        let result = try_register(&env, &client, name);

        if too_short {
            // Format validation fires before reserved check; either error is fine.
            assert!(result.is_err(), "'{}' should have been rejected", name);
        } else {
            assert_eq!(
                result,
                Err(ContractError::ReservedUsername),
                "'{}' should be rejected as ReservedUsername",
                name
            );
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Error discriminant test
// ═══════════════════════════════════════════════════════════════════════════

/// Verify that the ReservedUsername error has the expected discriminant (53).
#[test]
fn reserved_username_error_discriminant() {
    assert_eq!(ContractError::ReservedUsername as u32, 53);
}
