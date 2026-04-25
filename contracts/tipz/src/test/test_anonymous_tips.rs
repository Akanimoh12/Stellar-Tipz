//! Tests for anonymous tipping functionality

use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

use crate::test::test_init::setup_test_contract;
use crate::TipzContractClient;

fn register_creator(client: &TipzContractClient, env: &Env, creator: &Address) {
    client.register_profile(
        creator,
        &String::from_str(env, "testcreator"),
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

#[test]
fn test_anonymous_tip() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator);
    fund_tipper(&client, &env, &tipper);

    // Send anonymous tip
    client.send_tip(
        &tipper,
        &creator,
        &1_000_000,
        &String::from_str(&env, "Great work!"),
        &true,
    );

    // Get tip history for creator
    let history = client.get_recent_tips(&creator, &10, &0);
    assert_eq!(history.len(), 1);

    let tip = history.get(0).unwrap();
    assert!(tip.is_anonymous);
    assert!(tip.tipper.is_none()); // Tipper address is hidden
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

    // Send anonymous tip
    client.send_tip(
        &tipper,
        &creator,
        &1_000_000,
        &String::from_str(&env, "Great work!"),
        &true,
    );

    // Tipper can see their own tips
    let my_tips = client.get_tips_by_tipper(&tipper, &10);
    assert_eq!(my_tips.len(), 1);

    let tip = my_tips.get(0).unwrap();
    assert_eq!(tip.creator, creator);
    assert!(tip.is_anonymous);
}

#[test]
fn test_non_anonymous_tip() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator);
    fund_tipper(&client, &env, &tipper);

    // Send non-anonymous tip
    client.send_tip(
        &tipper,
        &creator,
        &1_000_000,
        &String::from_str(&env, "Great work!"),
        &false,
    );

    // Get tip history for creator
    let history = client.get_recent_tips(&creator, &10, &0);
    assert_eq!(history.len(), 1);

    let tip = history.get(0).unwrap();
    assert!(!tip.is_anonymous);
    assert!(tip.tipper.is_some());
    assert_eq!(tip.tipper.unwrap(), tipper);
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

    // Send anonymous tip
    client.send_tip(
        &tipper1,
        &creator,
        &1_000_000,
        &String::from_str(&env, "Anonymous support"),
        &true,
    );

    // Send public tip
    client.send_tip(
        &tipper2,
        &creator,
        &2_000_000,
        &String::from_str(&env, "Public support"),
        &false,
    );

    // Get tip history
    let history = client.get_recent_tips(&creator, &10, &0);
    assert_eq!(history.len(), 2);

    // Verify first tip is public
    let tip1 = history.get(0).unwrap();
    assert!(!tip1.is_anonymous);
    assert_eq!(tip1.tipper.unwrap(), tipper2);

    // Verify second tip is anonymous
    let tip2 = history.get(1).unwrap();
    assert!(tip2.is_anonymous);
    assert!(tip2.tipper.is_none());
}
