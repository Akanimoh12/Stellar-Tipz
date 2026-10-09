#![cfg(test)]

use crate::test::test_profiles::setup;
use soroban_sdk::{testutils::Address as _, Address, String};

#[test]
fn test_x_handle_normalization_register() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    // Register with handle WITHOUT @
    let username = String::from_str(&env, "alice");
    let display_name = String::from_str(&env, "Alice");
    let bio = String::from_str(&env, "Bio");
    let image_url = String::from_str(&env, "url");
    let x_handle = String::from_str(&env, "alice_x");

    let profile = client.register_profile(
        &caller,
        &username,
        &display_name,
        &bio,
        &image_url,
        &x_handle,
    );

    // Should be normalized to @alice_x
    assert_eq!(profile.x_handle, String::from_str(&env, "@alice_x"));
}

#[test]
fn test_x_handle_no_normalization_if_starts_with_at() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    // Register with handle WITH @
    let x_handle = String::from_str(&env, "@bob_x");

    let profile = client.register_profile(
        &caller,
        &String::from_str(&env, "bob"),
        &String::from_str(&env, "Bob"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &x_handle,
    );

    // Should remain @bob_x
    assert_eq!(profile.x_handle, String::from_str(&env, "@bob_x"));
}

#[test]
fn test_x_handle_normalization_update() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    client.register_profile(
        &caller,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, "old_handle"),
    );

    // Update with handle WITHOUT @
    client.update_profile(
        &caller,
        &None,
        &None,
        &None,
        &Some(String::from_str(&env, "new_handle")),
    );

    let updated = client.get_profile(&caller);
    assert_eq!(
        updated.profile.x_handle,
        String::from_str(&env, "@new_handle")
    );
}
