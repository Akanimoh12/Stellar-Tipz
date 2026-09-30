//! Tests for anonymous tipping functionality (issue #021).
//!
//! Design under test:
//! - The stored tip always keeps the real sender internally (refund path).
//! - Public views (`get_tip`, `get_recent_tips`) redact the sender of
//!   anonymous tips to the contract address.
//! - The tipper's own view (`get_tips_by_tipper`) is never redacted.
//! - Anonymous tips carry a stable `pseudonym` hash of
//!   `sha256(sender | creator | contract_salt)`; non-anonymous tips have none.

use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

use crate::test::test_init::setup_test_contract;
use crate::TipzContractClient;

static mut CREATOR_COUNTER: u32 = 0;

fn register_creator(client: &TipzContractClient, env: &Env, creator: &Address) {
    let n = unsafe { CREATOR_COUNTER += 1; CREATOR_COUNTER };
    // Build "user_1", "user_2", etc.
    let prefix = b"user_";
    let mut num_buf = [0u8; 8];
    let mut val = n;
    let mut end = num_buf.len();
    while val > 0 {
        end -= 1;
        num_buf[end] = b'0' + (val % 10) as u8;
        val /= 10;
    }
    let num_part = core::str::from_utf8(&num_buf[end..]).unwrap();
    // Combine prefix + num_part into a single &str
    let mut full = [0u8; 20];
    full[..prefix.len()].copy_from_slice(prefix);
    let num_bytes = num_part.as_bytes();
    full[prefix.len()..prefix.len() + num_bytes.len()].copy_from_slice(num_bytes);
    let username = core::str::from_utf8(&full[..prefix.len() + num_bytes.len()]).unwrap();
    client.register_profile(
        creator,
        &String::from_str(env, username),
        &String::from_str(env, "Test Creator"),
        &String::from_str(env, "Bio"),
        &String::from_str(env, ""),
        &String::from_str(env, "@test"),
    );
}

fn fund_tipper(client: &TipzContractClient, env: &Env, tipper: &Address) {
    let token = client.get_config().native_token;
    token::StellarAssetClient::new(env, &token).mint(tipper, &100_000_000);
}

fn tipper_native_balance(client: &TipzContractClient, env: &Env, tipper: &Address) -> i128 {
    let token_id = client.get_config().native_token;
    token::TokenClient::new(env, &token_id).balance(tipper)
}

#[test]
fn test_anonymous_tip_redacts_sender_in_creator_history() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator);
    fund_tipper(&client, &env, &tipper);

    client.send_tip(
        &tipper,
        &creator,
        &1_000_000,
        &String::from_str(&env, "Great work!"),
        &true,
        &false,
    );

    let history = client.get_recent_tips(&creator, &10, &0);
    assert_eq!(history.len(), 1);

    let tip = history.get(0).unwrap();
    assert!(tip.is_anonymous);
    assert_eq!(tip.sender, client.address); // Redacted
    assert_eq!(tip.creator, creator);
    assert!(tip.benefactor.is_none());
    let pseudonym = tip.pseudonym.expect("anonymous tip must carry a pseudonym");
    assert_eq!(pseudonym.len(), 32);
}

#[test]
fn test_anonymous_tip_get_tip_redacts_sender() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator);
    fund_tipper(&client, &env, &tipper);

    client.send_tip(
        &tipper,
        &creator,
        &1_000_000,
        &String::from_str(&env, "Great work!"),
        &true,
        &false,
    );

    // First stored tip has ID 0.
    let tip = client.get_tip(&0);
    assert!(tip.is_anonymous);
    assert_eq!(tip.sender, client.address); // Redacted public view
    assert_eq!(tip.amount, 1_000_000);
}

#[test]
fn test_tipper_sees_own_anonymous_tip() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator);
    fund_tipper(&client, &env, &tipper);

    client.send_tip(
        &tipper,
        &creator,
        &1_000_000,
        &String::from_str(&env, "Great work!"),
        &true,
        &false,
    );

    let my_tips = client.get_tips_by_tipper(&tipper, &10);
    assert_eq!(my_tips.len(), 1);

    let tip = my_tips.get(0).unwrap();
    assert_eq!(tip.id, 0);
    assert_eq!(tip.sender, tipper); // Own view keeps the real address
    assert_eq!(tip.creator, creator);
    assert!(tip.is_anonymous);
}

#[test]
fn test_non_anonymous_tip_exposes_sender() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator);
    fund_tipper(&client, &env, &tipper);

    client.send_tip(
        &tipper,
        &creator,
        &1_000_000,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let history = client.get_recent_tips(&creator, &10, &0);
    assert_eq!(history.len(), 1);

    let tip = history.get(0).unwrap();
    assert!(!tip.is_anonymous);
    assert_eq!(tip.sender, tipper); // Not redacted
    assert_eq!(tip.benefactor.expect("benefactor"), tipper);
    assert!(tip.pseudonym.is_none());
}

#[test]
fn test_mixed_anonymous_and_public_tips() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tipper1 = Address::generate(&env);
    let tipper2 = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator);
    fund_tipper(&client, &env, &tipper1);
    fund_tipper(&client, &env, &tipper2);

    // Send anonymous tip first...
    client.send_tip(
        &tipper1,
        &creator,
        &1_000_000,
        &String::from_str(&env, "Anonymous support"),
        &true,
        &false,
    );

    // ...then a public tip (newest first => index 0).
    client.send_tip(
        &tipper2,
        &creator,
        &2_000_000,
        &String::from_str(&env, "Public support"),
        &false,
        &false,
    );

    let history = client.get_recent_tips(&creator, &10, &0);
    assert_eq!(history.len(), 2);

    let public_tip = history.get(0).unwrap();
    assert!(!public_tip.is_anonymous);
    assert_eq!(public_tip.sender, tipper2);

    let anon_tip = history.get(1).unwrap();
    assert!(anon_tip.is_anonymous);
    assert_eq!(anon_tip.sender, client.address); // Redacted
    assert_ne!(anon_tip.pseudonym, None);
}

#[test]
fn test_pseudonym_stability_and_uniqueness() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tipper_a = Address::generate(&env);
    let tipper_b = Address::generate(&env);
    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator1);
    register_creator(&client, &env, &creator2);
    fund_tipper(&client, &env, &tipper_a);
    fund_tipper(&client, &env, &tipper_b);

    client.send_tip(
        &tipper_a,
        &creator1,
        &1_000_000,
        &String::from_str(&env, ""),
        &true,
        &false,
    );
    client.send_tip(
        &tipper_a,
        &creator1,
        &1_000_000,
        &String::from_str(&env, ""),
        &true,
        &false,
    );
    client.send_tip(
        &tipper_a,
        &creator2,
        &1_000_000,
        &String::from_str(&env, ""),
        &true,
        &false,
    );
    client.send_tip(
        &tipper_b,
        &creator1,
        &1_000_000,
        &String::from_str(&env, ""),
        &true,
        &false,
    );

    let c1_history = client.get_recent_tips(&creator1, &10, &0);
    assert_eq!(c1_history.len(), 3);

    // Same tipper -> same creator: identical pseudonyms across tips.
    let a1 = c1_history.get(0).unwrap().pseudonym.unwrap();
    let a2 = c1_history.get(1).unwrap().pseudonym.unwrap();
    assert_eq!(a1, a2);

    // Different tipper to the same creator: distinct pseudonym.
    let b1 = c1_history.get(2).unwrap().pseudonym.unwrap();
    assert_ne!(a1, b1);

    // Same tipper to a different creator: distinct pseudonym.
    let a_other = client
        .get_recent_tips(&creator2, &10, &0)
        .get(0)
        .unwrap()
        .pseudonym
        .unwrap();
    assert_ne!(a1, a_other);
}

#[test]
fn test_refund_of_anonymous_tip_resolves_real_sender() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator);
    fund_tipper(&client, &env, &tipper);

    client.send_tip(
        &tipper,
        &creator,
        &1_000_000,
        &String::from_str(&env, "Great work!"),
        &true,
        &false,
    );

    // The tipper can still reference their own tip despite public redaction.
    client.request_refund(&tipper, &0);

    let request = client
        .get_refund_request(&0)
        .expect("refund request should exist");
    assert_eq!(request.tipper, tipper);

    let balance_before = tipper_native_balance(&client, &env, &tipper);
    client.approve_refund(&creator, &0);

    let request = client.get_refund_request(&0).unwrap();
    let balance_after = tipper_native_balance(&client, &env, &tipper);
    assert_eq!(
        balance_after - balance_before,
        request.refund_amount,
        "refund must pay out to the real tipper"
    );

    // Creator's contract-side balance reflects the refunded tip amount.
    let profile = client.get_profile(&creator);
    assert_eq!(profile.profile.balance, 0);
}
