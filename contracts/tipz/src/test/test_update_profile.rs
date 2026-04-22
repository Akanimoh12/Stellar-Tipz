#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::errors::ContractError;
use crate::{TipzContract, TipzContractClient};

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

fn register(
    env: &Env,
    client: &TipzContractClient,
    caller: &Address,
    username: &str,
) -> crate::types::Profile {
    client.register_profile(
        caller,
        &String::from_str(env, username),
        &String::from_str(env, "Display Name"),
        &String::from_str(env, "A short bio."),
        &String::from_str(env, "https://example.com/avatar.png"),
        &String::from_str(env, "handle"),
    )
}

#[test]
fn test_update_profile_display_name() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    register(&env, &client, &caller, "alice");

    let new_name = String::from_str(&env, "New Display Name");
    client.update_profile(&caller, &Some(new_name.clone()), &None, &None, &None);

    let profile = client.get_profile(&caller);
    assert_eq!(profile.display_name, new_name);
}

#[test]
fn test_update_profile_bio() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    register(&env, &client, &caller, "alice");

    let new_bio = String::from_str(&env, "Updated bio content");
    client.update_profile(&caller, &None, &Some(new_bio.clone()), &None, &None);

    let profile = client.get_profile(&caller);
    assert_eq!(profile.bio, new_bio);
}

#[test]
fn test_update_profile_image_url() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    register(&env, &client, &caller, "alice");

    let new_url = String::from_str(&env, "https://new.example.com/avatar.png");
    client.update_profile(&caller, &None, &None, &Some(new_url.clone()), &None);

    let profile = client.get_profile(&caller);
    assert_eq!(profile.image_url, new_url);
}

#[test]
fn test_update_profile_x_handle() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    register(&env, &client, &caller, "alice");

    let new_handle = String::from_str(&env, "new_x_handle");
    client.update_profile(&caller, &None, &None, &None, &Some(new_handle.clone()));

    let profile = client.get_profile(&caller);
    assert_eq!(profile.x_handle, new_handle);
}

#[test]
fn test_update_profile_multiple_fields() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    register(&env, &client, &caller, "alice");

    let new_name = String::from_str(&env, "Alice Updated");
    let new_bio = String::from_str(&env, "New bio");
    let new_url = String::from_str(&env, "https://updated.com/img.png");
    let new_handle = String::from_str(&env, "alice_new");

    client.update_profile(
        &caller,
        &Some(new_name.clone()),
        &Some(new_bio.clone()),
        &Some(new_url.clone()),
        &Some(new_handle.clone()),
    );

    let profile = client.get_profile(&caller);
    assert_eq!(profile.display_name, new_name);
    assert_eq!(profile.bio, new_bio);
    assert_eq!(profile.image_url, new_url);
    assert_eq!(profile.x_handle, new_handle);
}

#[test]
fn test_update_profile_preserves_unchanged_fields() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    let original = register(&env, &client, &caller, "alice");

    let new_name = String::from_str(&env, "New Name Only");
    client.update_profile(&caller, &Some(new_name.clone()), &None, &None, &None);

    let profile = client.get_profile(&caller);
    assert_eq!(profile.display_name, new_name);
    assert_eq!(profile.bio, original.bio);
    assert_eq!(profile.image_url, original.image_url);
    assert_eq!(profile.x_handle, original.x_handle);
    assert_eq!(profile.username, original.username);
    assert_eq!(profile.owner, original.owner);
}

#[test]
fn test_update_profile_not_registered() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    let result = client.try_update_profile(
        &caller,
        &Some(String::from_str(&env, "Name")),
        &None,
        &None,
        &None,
    );

    assert_eq!(result, Err(Ok(ContractError::NotRegistered)));
}

#[test]
fn test_update_profile_empty_display_name() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    register(&env, &client, &caller, "alice");

    let result = client.try_update_profile(
        &caller,
        &Some(String::from_str(&env, "")),
        &None,
        &None,
        &None,
    );

    assert_eq!(result, Err(Ok(ContractError::InvalidDisplayName)));
}

#[test]
fn test_update_profile_display_name_too_long() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    register(&env, &client, &caller, "alice");

    let long_name = String::from_str(
        &env,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    let result = client.try_update_profile(&caller, &Some(long_name), &None, &None, &None);

    assert_eq!(result, Err(Ok(ContractError::InvalidDisplayName)));
}

#[test]
fn test_update_profile_bio_too_long() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    register(&env, &client, &caller, "alice");

    let long_bio = String::from_str(
        &env,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\
         aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\
         aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\
         aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\
         aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\
         aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\
         a",
    );
    let result = client.try_update_profile(&caller, &None, &Some(long_bio), &None, &None);

    assert_eq!(result, Err(Ok(ContractError::MessageTooLong)));
}

#[test]
fn test_update_profile_image_url_too_long() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    register(&env, &client, &caller, "alice");

    let long_url_bytes = [b'a'; 257];
    let long_url = String::from_str(&env, core::str::from_utf8(&long_url_bytes).unwrap());
    let result = client.try_update_profile(&caller, &None, &None, &Some(long_url), &None);

    assert_eq!(result, Err(Ok(ContractError::InvalidImageUrl)));
}

#[test]
fn test_update_profile_updates_timestamp() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    let original = register(&env, &client, &caller, "alice");

    let new_name = String::from_str(&env, "Updated");
    client.update_profile(&caller, &Some(new_name), &None, &None, &None);

    let profile = client.get_profile(&caller);
    assert!(profile.updated_at >= original.updated_at);
}

#[test]
fn test_update_profile_no_changes() {
    let (env, client) = setup();
    let caller = Address::generate(&env);

    let original = register(&env, &client, &caller, "alice");

    client.update_profile(&caller, &None, &None, &None, &None);

    let profile = client.get_profile(&caller);
    assert_eq!(profile.display_name, original.display_name);
    assert_eq!(profile.bio, original.bio);
    assert_eq!(profile.image_url, original.image_url);
    assert_eq!(profile.x_handle, original.x_handle);
}
