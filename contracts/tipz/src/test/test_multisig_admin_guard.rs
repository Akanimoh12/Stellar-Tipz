//! Tests that privileged admin entrypoints route through multisig once it is
//! enabled, and remain directly callable when it is not (#1155).
//!
//! Covers: set_fee, pause, unpause, propose_admin_change (admin transfer),
//! and upgrade.

#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _,
    vec, Address, BytesN, Env,
};

use crate::errors::ContractError;
use crate::test::test_init::setup_test_contract;

fn enable_multisig(env: &Env, client: &crate::TipzContractClient, admin: &Address) {
    let signer1 = Address::generate(env);
    let signer2 = Address::generate(env);
    let signers = vec![env, signer1, signer2];
    client.set_multisig_config(admin, &2, &signers);
}

#[test]
fn test_set_fee_blocked_when_multisig_enabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = setup_test_contract(&env, &admin);

    enable_multisig(&env, &client, &admin);

    let result = client.try_set_fee(&admin, &500);
    assert_eq!(result, Err(Ok(ContractError::MultisigRequired)));
}

#[test]
fn test_set_fee_allowed_when_multisig_disabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = setup_test_contract(&env, &admin);

    client.set_fee(&admin, &500);
    assert_eq!(client.get_config().fee_bps, 500);
}

#[test]
fn test_pause_blocked_when_multisig_enabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = setup_test_contract(&env, &admin);

    enable_multisig(&env, &client, &admin);

    let result = client.try_pause(&admin);
    assert_eq!(result, Err(Ok(ContractError::MultisigRequired)));
    assert!(!client.is_paused());
}

#[test]
fn test_pause_allowed_when_multisig_disabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = setup_test_contract(&env, &admin);

    client.pause(&admin);
    assert!(client.is_paused());
}

#[test]
fn test_unpause_blocked_when_multisig_enabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = setup_test_contract(&env, &admin);

    // Pause directly while multisig is still off.
    client.pause(&admin);

    enable_multisig(&env, &client, &admin);

    let result = client.try_unpause(&admin);
    assert_eq!(result, Err(Ok(ContractError::MultisigRequired)));
    assert!(client.is_paused());
}

#[test]
fn test_unpause_allowed_when_multisig_disabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = setup_test_contract(&env, &admin);

    client.pause(&admin);
    client.unpause(&admin);
    assert!(!client.is_paused());
}

#[test]
fn test_propose_admin_change_blocked_when_multisig_enabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let client = setup_test_contract(&env, &admin);

    enable_multisig(&env, &client, &admin);

    let result = client.try_propose_admin_change(&admin, &new_admin);
    assert_eq!(result, Err(Ok(ContractError::MultisigRequired)));
}

#[test]
fn test_propose_admin_change_allowed_when_multisig_disabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let client = setup_test_contract(&env, &admin);

    client.propose_admin_change(&admin, &new_admin);
    assert!(client.get_admin_change_proposal().is_some());
}

#[test]
fn test_upgrade_blocked_when_multisig_enabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = setup_test_contract(&env, &admin);

    enable_multisig(&env, &client, &admin);

    let fake_hash = BytesN::from_array(&env, &[7u8; 32]);
    let result = client.try_upgrade(&admin, &fake_hash);
    assert_eq!(result, Err(Ok(ContractError::MultisigRequired)));
}

#[test]
fn test_upgrade_direct_call_reaches_normal_validation_when_multisig_disabled() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = setup_test_contract(&env, &admin);

    // No proposed upgrade staged yet, so the normal (non-multisig) path
    // should surface NotFound rather than the multisig guard error.
    let fake_hash = BytesN::from_array(&env, &[7u8; 32]);
    let result = client.try_upgrade(&admin, &fake_hash);
    assert_eq!(result, Err(Ok(ContractError::NotFound)));
}
