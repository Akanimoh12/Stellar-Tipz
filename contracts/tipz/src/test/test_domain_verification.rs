#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, String,
};

use crate::{TipzContract, TipzContractClient};

fn setup_env() -> (Env, TipzContractClient<'static>, Address, Address) {
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

    let creator = Address::generate(&env);
    client.register_profile(
        &creator,
        &String::from_str(&env, "alice"),
        &String::from_str(&env, "Alice"),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
        &String::from_str(&env, ""),
    );

    (env, client, creator, admin)
}

#[test]
fn test_set_domain_for_verification() {
    let (env, client, creator, _admin) = setup_env();
    let domain = String::from_str(&env, "alice.com");

    client.set_domain(&creator, &domain);

    let profile = client.get_profile(&creator).profile;
    assert_eq!(profile.domain, domain);
    assert!(!profile.domain_verified);
}

#[test]
fn test_admin_verify_domain() {
    let (env, client, creator, admin) = setup_env();
    let domain = String::from_str(&env, "alice.com");

    client.set_domain(&creator, &domain);
    client.verify_domain(&admin, &creator);

    let profile = client.get_profile(&creator).profile;
    assert!(profile.domain_verified);
    assert!(profile.verification.is_verified);
}

#[test]
fn test_domain_reverification_expires_stale_verification() {
    let (env, client, creator, admin) = setup_env();
    let domain = String::from_str(&env, "alice.com");

    client.set_domain_reverify_interval(&admin, &86_400_u64);
    client.set_domain(&creator, &domain);
    client.verify_domain(&admin, &creator);

    env.ledger().set_timestamp(env.ledger().timestamp() + 86_401);

    let profile = client.get_profile(&creator).profile;
    assert!(!profile.domain_verified);
}
