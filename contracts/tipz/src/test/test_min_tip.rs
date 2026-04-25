#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Events},
    token, Address, Env, String,
};

use crate::errors::ContractError;
use crate::TipzContract;
use crate::TipzContractClient;

fn setup_env() -> (
    Env,
    TipzContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
    Address,
) {
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

    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let username = String::from_str(&env, "alice");
    let display_name = String::from_str(&env, "Alice");
    let bio = String::from_str(&env, "");
    let image_url = String::from_str(&env, "");
    let x_handle = String::from_str(&env, "");
    client.register_profile(
        &creator,
        &username,
        &display_name,
        &bio,
        &image_url,
        &x_handle,
    );

    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&tipper, &500_000_000);

    (
        env,
        client,
        contract_id,
        admin,
        tipper,
        creator,
        token_address,
    )
}

#[test]
fn test_tip_below_minimum_fails() {
    let (env, client, _contract_id, _admin, tipper, creator, _sac) = setup_env();

    let min = client.get_min_tip_amount();
    assert!(min > 0);

    let message = String::from_str(&env, "tip");
    let amount: i128 = min - 1;

    let res = client.try_send_tip(&tipper, &creator, &amount, &message, &false);
    assert_eq!(res, Err(Ok(ContractError::TipBelowMinimum)));
}

#[test]
fn test_tip_at_minimum_succeeds() {
    let (env, client, _contract_id, _admin, tipper, creator, _sac) = setup_env();

    let min = client.get_min_tip_amount();
    let message = String::from_str(&env, "tip");

    client.send_tip(&tipper, &creator, &min, &message, &false);
}

#[test]
fn test_admin_can_update_min_tip_amount() {
    let (_env, client, _contract_id, admin, _tipper, _creator, _sac) = setup_env();

    client.set_min_tip_amount(&admin, &2_000_000_i128);
    assert_eq!(client.get_min_tip_amount(), 2_000_000_i128);
}

macro_rules! assert_topic {
    ($val:expr, $sym:expr) => {
        assert!(
            $sym.to_val().shallow_eq(&$val),
            "topic mismatch: expected {:?}",
            stringify!($sym)
        );
    };
}

#[test]
fn test_set_min_tip_emits_event_with_old_and_new() {
    let (env, client, _contract_id, admin, _tipper, _creator, _sac) = setup_env();

    let old_min = client.get_min_tip_amount();
    let new_min = 2_000_000_i128;

    client.set_min_tip_amount(&admin, &new_min);

    let events = env.events().all();
    assert!(!events.is_empty(), "expected tip/min event to be emitted");

    let last_event = events.last().unwrap();
    let (_contract, topics, data) = last_event;

    assert_eq!(topics.len(), 2);
    assert_topic!(topics.get(0).unwrap(), soroban_sdk::symbol_short!("tip"));
    assert_topic!(topics.get(1).unwrap(), soroban_sdk::symbol_short!("min"));

    let (emitted_old, emitted_new): (i128, i128) = soroban_sdk::FromVal::from_val(&env, &data);
    assert_eq!(emitted_old, old_min, "old_min in event mismatch");
    assert_eq!(emitted_new, new_min, "new_min in event mismatch");
}

#[test]
fn test_set_min_tip_event_old_value_tracks_previous_update() {
    let (env, client, _contract_id, admin, _tipper, _creator, _sac) = setup_env();

    // First update: default -> 2_000_000
    client.set_min_tip_amount(&admin, &2_000_000_i128);
    // Second update: 2_000_000 -> 5_000_000
    client.set_min_tip_amount(&admin, &5_000_000_i128);

    let events = env.events().all();
    let last_event = events.last().unwrap();
    let (_contract, topics, data) = last_event;

    assert_topic!(topics.get(0).unwrap(), soroban_sdk::symbol_short!("tip"));
    assert_topic!(topics.get(1).unwrap(), soroban_sdk::symbol_short!("min"));

    let (emitted_old, emitted_new): (i128, i128) = soroban_sdk::FromVal::from_val(&env, &data);
    assert_eq!(emitted_old, 2_000_000_i128, "old value should be 2_000_000");
    assert_eq!(emitted_new, 5_000_000_i128, "new value should be 5_000_000");
}

#[test]
fn test_set_min_tip_non_admin_rejected() {
    let (_env, client, _contract_id, _admin, tipper, _creator, _sac) = setup_env();
    let res = client.try_set_min_tip_amount(&tipper, &2_000_000_i128);
    assert!(res.is_err());
}

#[test]
fn test_set_min_tip_negative_amount_rejected() {
    let (_env, client, _contract_id, admin, _tipper, _creator, _sac) = setup_env();
    let res = client.try_set_min_tip_amount(&admin, &-1_i128);
    assert_eq!(res, Err(Ok(ContractError::InvalidAmount)));
}
