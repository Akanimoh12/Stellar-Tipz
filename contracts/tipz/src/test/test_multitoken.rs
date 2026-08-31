//! Tests for multi-token support and the admin-managed token allowlist (#1182).
//!
//! Coverage:
//! - An allowed token can be tipped and withdrawn.
//! - An unlisted token is rejected before any call reaches the token contract.
//! - `decimals` and `symbol` are snapshotted at add-time.
//! - A non-token address cannot be admitted to the allowlist.
//! - **A removed token blocks new tips but stays fully withdrawable** — the
//!   case the issue calls out as the one people miss.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

use crate::test::test_init::setup_test_contract_default;
use crate::TipzContractClient;

/// The default global minimum tip is 1_000_000 stroops (see `admin::initialize`),
/// so every fixture below tips at or above it.
const TIP_AMOUNT: i128 = 2_000_000;
const MINT_AMOUNT: i128 = 100_000_000;

/// Register a real Stellar asset contract so `decimals`/`symbol` probes succeed.
fn make_token(env: &Env, admin: &Address, holder: &Address) -> Address {
    let asset = env.register_stellar_asset_contract_v2(admin.clone());
    let addr = asset.address();
    token::StellarAssetClient::new(env, &addr).mint(holder, &MINT_AMOUNT);
    addr
}

fn register_creator(env: &Env, client: &TipzContractClient, creator: &Address, name: &str) {
    client.register_profile(
        creator,
        &String::from_str(env, name),
        &String::from_str(env, name),
        &String::from_str(env, "Bio"),
        &String::from_str(env, ""),
        &String::from_str(env, ""),
    );
}

// ── allowlist management ─────────────────────────────────────────────────────

#[test]
fn test_add_accepted_token() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let tipper = Address::generate(&env);
    let usdc = make_token(&env, &admin, &tipper);
    let oracle = Address::generate(&env);

    client.add_accepted_token(&admin, &usdc, &Some(oracle.clone()));

    let accepted = client.get_accepted_tokens();
    assert_eq!(accepted.len(), 1);
    let entry = accepted.get(0).unwrap();
    assert_eq!(entry.token_address, usdc);
    assert_eq!(entry.oracle_address, Some(oracle));
    assert!(entry.enabled);
}

/// Acceptance criterion: adding a token records decimals and symbol at add-time.
#[test]
fn test_add_records_decimals_and_symbol() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let tipper = Address::generate(&env);
    let usdc = make_token(&env, &admin, &tipper);

    client.add_accepted_token(&admin, &usdc, &None);

    let entry = client.get_accepted_tokens().get(0).unwrap();
    let token_client = token::TokenClient::new(&env, &usdc);
    assert_eq!(entry.decimals, token_client.decimals());
    assert_eq!(entry.symbol, token_client.symbol());
}

/// A plain address is not a token contract, so it cannot answer the SEP-41
/// metadata probe and must be refused rather than silently allowlisted.
#[test]
fn test_add_rejects_non_token_address() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let not_a_token = Address::generate(&env);

    let result = client.try_add_accepted_token(&admin, &not_a_token, &None);
    assert!(result.is_err());
    assert_eq!(client.get_accepted_tokens().len(), 0);
}

#[test]
fn test_add_accepted_token_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let tipper = Address::generate(&env);
    let usdc = make_token(&env, &admin, &tipper);
    let impostor = Address::generate(&env);

    let result = client.try_add_accepted_token(&impostor, &usdc, &None);
    assert!(result.is_err());
    assert_eq!(client.get_accepted_tokens().len(), 0);
}

#[test]
fn test_remove_unknown_token_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let never_added = Address::generate(&env);
    assert!(client
        .try_remove_accepted_token(&admin, &never_added)
        .is_err());
}

#[test]
fn test_remove_accepted_token() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let tipper = Address::generate(&env);
    let usdc = make_token(&env, &admin, &tipper);

    client.add_accepted_token(&admin, &usdc, &None);
    client.remove_accepted_token(&admin, &usdc);

    // `get_accepted_tokens` lists only enabled tokens.
    assert_eq!(client.get_accepted_tokens().len(), 0);
}

// ── tipping ──────────────────────────────────────────────────────────────────

/// Acceptance criterion: an allowed token works end to end.
#[test]
fn test_tip_with_allowed_token() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);
    let usdc = make_token(&env, &admin, &tipper);

    client.add_accepted_token(&admin, &usdc, &None);
    register_creator(&env, &client, &creator, "creator");

    client.send_tip_token(
        &tipper,
        &creator,
        &TIP_AMOUNT,
        &usdc,
        &String::from_str(&env, "Here's some USDC!"),
        &false,
    );

    let balances = client.get_token_balances(&creator);
    assert_eq!(balances.len(), 1);
    assert_eq!(balances.get(0).unwrap().amount, TIP_AMOUNT);
}

/// Acceptance criterion: an unlisted token is rejected.
#[test]
fn test_reject_unlisted_token() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);
    // A perfectly valid token contract - it is simply not on the allowlist.
    let rogue = make_token(&env, &admin, &tipper);

    register_creator(&env, &client, &creator, "creator");

    let result = client.try_send_tip_token(
        &tipper,
        &creator,
        &TIP_AMOUNT,
        &rogue,
        &String::from_str(&env, "Test"),
        &false,
    );
    assert!(result.is_err());

    // No balance was credited and no funds left the tipper.
    assert_eq!(client.get_token_balances(&creator).len(), 0);
    assert_eq!(
        token::TokenClient::new(&env, &rogue).balance(&tipper),
        MINT_AMOUNT
    );
}

#[test]
fn test_withdraw_allowed_token() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);
    let usdc = make_token(&env, &admin, &tipper);

    client.add_accepted_token(&admin, &usdc, &None);
    register_creator(&env, &client, &creator, "creator");
    client.send_tip_token(
        &tipper,
        &creator,
        &TIP_AMOUNT,
        &usdc,
        &String::from_str(&env, "Tip"),
        &false,
    );

    let withdraw = TIP_AMOUNT / 2;
    client.withdraw_token(&creator, &usdc, &withdraw);

    assert_eq!(
        client.get_token_balances(&creator).get(0).unwrap().amount,
        TIP_AMOUNT - withdraw
    );
    // The creator actually received funds, net of the fee.
    assert!(token::TokenClient::new(&env, &usdc).balance(&creator) > 0);
}

// ── the case people miss: removal must never strand funds ────────────────────

/// Acceptance criterion: a removed token blocks new tips but existing balances
/// stay fully withdrawable.
#[test]
fn test_removed_token_still_withdrawable() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);
    let usdc = make_token(&env, &admin, &tipper);

    client.add_accepted_token(&admin, &usdc, &None);
    register_creator(&env, &client, &creator, "creator");
    client.send_tip_token(
        &tipper,
        &creator,
        &TIP_AMOUNT,
        &usdc,
        &String::from_str(&env, "Tip"),
        &false,
    );

    // Admin delists the token.
    client.remove_accepted_token(&admin, &usdc);

    // New tips in that token are refused...
    let blocked = client.try_send_tip_token(
        &tipper,
        &creator,
        &TIP_AMOUNT,
        &usdc,
        &String::from_str(&env, "Should fail"),
        &false,
    );
    assert!(
        blocked.is_err(),
        "a delisted token must not accept new tips"
    );

    // ...but the balance accrued while it was allowed is still visible...
    let balances = client.get_token_balances(&creator);
    assert_eq!(
        balances.len(),
        1,
        "delisting must not hide accrued balances"
    );
    assert_eq!(balances.get(0).unwrap().amount, TIP_AMOUNT);

    // ...and can be withdrawn in full.
    let creator_before = token::TokenClient::new(&env, &usdc).balance(&creator);
    client.withdraw_token(&creator, &usdc, &TIP_AMOUNT);

    assert_eq!(
        client.get_token_balances(&creator).len(),
        0,
        "the whole balance should have been withdrawn"
    );
    assert!(
        token::TokenClient::new(&env, &usdc).balance(&creator) > creator_before,
        "delisting must never strand funds"
    );
}

/// Re-adding a delisted token restores tipping and refreshes its metadata.
#[test]
fn test_readding_removed_token_reenables_it() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _fee_collector, _native) = setup_test_contract_default(&env);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);
    let usdc = make_token(&env, &admin, &tipper);

    client.add_accepted_token(&admin, &usdc, &None);
    register_creator(&env, &client, &creator, "creator");
    client.remove_accepted_token(&admin, &usdc);
    client.add_accepted_token(&admin, &usdc, &None);

    let accepted = client.get_accepted_tokens();
    assert_eq!(accepted.len(), 1, "re-adding must not duplicate the entry");
    assert!(accepted.get(0).unwrap().enabled);

    client.send_tip_token(
        &tipper,
        &creator,
        &TIP_AMOUNT,
        &usdc,
        &String::from_str(&env, "Back on"),
        &false,
    );
    assert_eq!(
        client.get_token_balances(&creator).get(0).unwrap().amount,
        TIP_AMOUNT
    );
}
