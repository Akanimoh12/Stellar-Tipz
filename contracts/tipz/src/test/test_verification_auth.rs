#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

use crate::errors::ContractError;
use crate::types::VerificationType;
use crate::{TipzContract, TipzContractClient};

// ── helpers ──────────────────────────────────────────────────────────────────

fn setup() -> (Env, TipzContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin);
    let token_address = token_contract.address();
    let _ = token::StellarAssetClient::new(&env, &token_address);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200_u32, &token_address);

    (env, client, admin)
}

fn register_user(env: &Env, client: &TipzContractClient<'static>, name: &str) -> Address {
    let caller = Address::generate(env);
    client.register_profile(
        &caller,
        &String::from_str(env, name),
        &String::from_str(env, "Display Name"),
        &String::from_str(env, "Bio"),
        &String::from_str(env, "https://example.com/avatar.png"),
        &String::from_str(env, name),
    );
    caller
}

// ── Verification authorization tests ─────────────────────────────────────────

#[test]
fn test_non_admin_cannot_approve_verification() {
    let (env, client, _admin) = setup();
    let creator = register_user(&env, &client, "creator1");
    let attacker = register_user(&env, &client, "attacker1");

    let result = client.try_approve_verification(&attacker, &creator, &VerificationType::Identity);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));

    // Self-approval must fail too.
    let result = client.try_approve_verification(&creator, &creator, &VerificationType::Identity);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));

    let status = client.get_verification_status(&creator);
    assert!(!status.is_verified);
}

#[test]
fn test_non_admin_cannot_revoke_verification() {
    let (env, client, admin) = setup();
    let creator = register_user(&env, &client, "creator1");
    let attacker = register_user(&env, &client, "attacker1");

    client.approve_verification(&admin, &creator, &VerificationType::Identity);
    assert!(client.get_verification_status(&creator).is_verified);

    let result = client.try_revoke_verification(&attacker, &creator);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));

    let status = client.get_verification_status(&creator);
    assert!(status.is_verified);
}

#[test]
fn test_admin_can_approve_and_revoke_verification() {
    let (env, client, admin) = setup();
    let creator = register_user(&env, &client, "creator1");

    client.approve_verification(&admin, &creator, &VerificationType::Identity);
    let status = client.get_verification_status(&creator);
    assert!(status.is_verified);
    assert_eq!(status.verification_type, VerificationType::Identity);

    client.revoke_verification(&admin, &creator);
    let status = client.get_verification_status(&creator);
    assert!(!status.is_verified);
    assert_eq!(status.verification_type, VerificationType::Unverified);
}
