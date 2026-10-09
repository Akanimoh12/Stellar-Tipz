#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

use crate::errors::ContractError;
use crate::{TipzContract, TipzContractClient};

fn setup_env() -> (Env, TipzContractClient<'static>, Address, Address, Address) {
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

    client.register_profile(
        &creator,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&tipper, &500_000_000);

    (env, client, tipper, creator, admin)
}

#[test]
fn test_creator_custom_min_tip() {
    let (env, client, tipper, creator, _admin) = setup_env();
    let msg = String::from_str(&env, "tip");

    client.set_min_tip(&creator, &500_i128);

    let result = client.try_send_tip(&tipper, &creator, &100_i128, &msg, &false, &false);
    assert_eq!(result, Err(Ok(ContractError::BelowCreatorMinimum)));

    client.send_tip(&tipper, &creator, &500_i128, &msg, &false, &false);
}

#[test]
fn test_fallback_to_global_min() {
    let (_env, client, _tipper, creator, _admin) = setup_env();
    let global_min = client.get_min_tip_amount();
    let min = client.get_creator_min_tip(&creator);
    assert_eq!(min, global_min);
}

#[test]
fn test_reset_creator_min_tip_to_global() {
    let (_env, client, _tipper, creator, _admin) = setup_env();
    let global_min = client.get_min_tip_amount();

    client.set_min_tip(&creator, &500_i128);
    assert_eq!(client.get_creator_min_tip(&creator), 500_i128);

    client.set_min_tip(&creator, &0_i128);
    assert_eq!(client.get_creator_min_tip(&creator), global_min);
}
