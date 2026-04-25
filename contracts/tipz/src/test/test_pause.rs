#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

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

    // Register profile through public API so pause guard is exercised.
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
fn test_pause_blocks_tips() {
    let (env, client, _contract_id, admin, tipper, creator, _sac) = setup_env();

    client.pause(&admin);
    assert!(client.is_paused());

    let message = String::from_str(&env, "tip");
    let amount: i128 = 100_000_000;

    let res = client.try_send_tip(&tipper, &creator, &amount, &message, &false);
    assert_eq!(res, Err(Ok(ContractError::ContractPaused)));
}

#[test]
fn test_unpause_allows_tips() {
    let (env, client, _contract_id, admin, tipper, creator, _sac) = setup_env();

    client.pause(&admin);
    client.unpause(&admin);
    assert!(!client.is_paused());

    let message = String::from_str(&env, "tip");
    let amount: i128 = 100_000_000;

    client.send_tip(&tipper, &creator, &amount, &message, &false);
}

#[test]
fn test_only_admin_can_pause() {
    let (env, client, _contract_id, _admin, _tipper, _creator, _sac) = setup_env();

    let attacker = Address::generate(&env);
    let res = client.try_pause(&attacker);
    assert_eq!(res, Err(Ok(ContractError::NotAuthorized)));
}
