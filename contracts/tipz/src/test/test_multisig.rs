//! Tests for multi-signature admin operations

use soroban_sdk::{testutils::{Address as _, Ledger as _}, vec, Address, Env};

use crate::multisig::Action;
use crate::test::test_init::setup_test_contract;
use crate::TipzContractClient;

#[test]
fn test_multisig_pause() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);

    // Set up multi-sig with 2-of-3 requirement
    let signers = vec![&env, signer1.clone(), signer2.clone(), signer3.clone()];
    client.set_multisig_config(&admin, &2, &signers);

    // Propose pause action
    let proposal_id = client.propose_action(&signer1, &Action::Pause);

    // Not yet executed (1 of 2)
    assert!(!client.is_paused());

    // Second signer approves
    client.approve_action(&signer2, &proposal_id);

    // Now executed (2 of 2)
    assert!(client.is_paused());
}

#[test]
fn test_proposal_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);

    let signers = vec![&env, signer1.clone(), signer2.clone()];
    client.set_multisig_config(&admin, &2, &signers);

    let proposal_id = client.propose_action(&signer1, &Action::Pause);

    // Advance time by 8 days (proposal expires after 7 days)
    let current_time = env.ledger().timestamp();
    env.ledger().set_timestamp(current_time + 8 * 24 * 3600);

    // Try to approve expired proposal
    let result = client.try_approve_action(&signer2, &proposal_id);
    assert!(result.is_err());
}

#[test]
fn test_multisig_fee_change() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);

    let signers = vec![&env, signer1.clone(), signer2.clone()];
    client.set_multisig_config(&admin, &2, &signers);

    // Propose fee change to 500 bps (5%)
    let proposal_id = client.propose_action(&signer1, &Action::SetFee(500));

    // Approve and execute
    client.approve_action(&signer2, &proposal_id);

    // Verify fee was changed
    let config = client.get_config();
    assert_eq!(config.fee_bps, 500);
}

#[test]
fn test_multisig_admin_rotation() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);

    let signers = vec![&env, signer1.clone(), signer2.clone()];
    client.set_multisig_config(&admin, &2, &signers);

    // Propose admin change
    let proposal_id = client.propose_action(&signer1, &Action::SetAdmin(new_admin.clone()));

    // Approve and execute
    client.approve_action(&signer2, &proposal_id);

    // Verify admin was changed
    let config = client.get_config();
    assert_eq!(config.admin, new_admin);
}

#[test]
fn test_get_pending_proposals() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);

    let signers = vec![&env, signer1.clone(), signer2.clone()];
    client.set_multisig_config(&admin, &2, &signers);

    // Create multiple proposals
    client.propose_action(&signer1, &Action::Pause);
    client.propose_action(&signer1, &Action::SetFee(300));

    // Get pending proposals
    let pending = client.get_pending_proposals();
    assert_eq!(pending.len(), 2);
}

#[test]
fn test_unauthorized_signer() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);

    let signers = vec![&env, signer1.clone(), signer2.clone()];
    client.set_multisig_config(&admin, &2, &signers);

    // Unauthorized user tries to propose
    let result = client.try_propose_action(&unauthorized, &Action::Pause);
    assert!(result.is_err());
}

#[test]
fn test_single_signature_auto_execute() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);

    // Set up 1-of-1 (auto-execute)
    let signers = vec![&env, signer1.clone()];
    client.set_multisig_config(&admin, &1, &signers);

    // Propose pause - should auto-execute
    client.propose_action(&signer1, &Action::Pause);

    // Should be paused immediately
    assert!(client.is_paused());
}
