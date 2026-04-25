//! Tests for donation page configuration

use soroban_sdk::{testutils::Address as _, vec, Address, Env, String};

use crate::test::test_init::setup_test_contract;
use crate::types::DonationPageConfig;
use crate::TipzContractClient;

fn register_creator(client: &TipzContractClient, env: &Env, creator: &Address, username: &str) {
    client.register_profile(
        creator,
        &String::from_str(env, username),
        &String::from_str(env, "Test Creator"),
        &String::from_str(env, "Bio"),
        &String::from_str(env, ""),
        &String::from_str(env, "@test"),
    );
}

#[test]
fn test_set_donation_page() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator, "artist");

    let config = DonationPageConfig {
        welcome_message: String::from_str(&env, "Support my art!"),
        suggested_amounts: vec![&env, 5_000_000, 10_000_000, 25_000_000, 50_000_000],
        theme_color: String::from_str(&env, "#ff6b6b"),
        header_image_uri: String::from_str(&env, "ipfs://QmTest"),
        is_default: false,
    };

    client.set_donation_page(&creator, &config);

    let page = client.get_donation_page(&creator);
    assert_eq!(
        page.welcome_message,
        String::from_str(&env, "Support my art!")
    );
    assert_eq!(page.theme_color, String::from_str(&env, "#ff6b6b"));
    assert!(!page.is_default);
}

#[test]
fn test_donation_page_default() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator, "newcreator");

    // Creator without custom page gets default
    let page = client.get_donation_page(&creator);
    assert!(page.is_default);
    assert_eq!(
        page.welcome_message,
        String::from_str(&env, "Support my work!")
    );
}

#[test]
fn test_donation_page_suggested_amounts() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator, "creator");

    let config = DonationPageConfig {
        welcome_message: String::from_str(&env, "Thanks!"),
        suggested_amounts: vec![&env, 1_000_000, 5_000_000, 10_000_000],
        theme_color: String::from_str(&env, "#3b82f6"),
        header_image_uri: String::from_str(&env, ""),
        is_default: false,
    };

    client.set_donation_page(&creator, &config);

    let page = client.get_donation_page(&creator);
    assert_eq!(page.suggested_amounts.len(), 3);
    assert_eq!(page.suggested_amounts.get(0).unwrap(), 1_000_000);
}

#[test]
fn test_donation_page_validation_message_too_long() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator, "creator");

    // Create a message longer than 500 chars
    let long_message = "a".repeat(501);

    let config = DonationPageConfig {
        welcome_message: String::from_str(&env, &long_message),
        suggested_amounts: vec![&env, 5_000_000],
        theme_color: String::from_str(&env, "#ff6b6b"),
        header_image_uri: String::from_str(&env, ""),
        is_default: false,
    };

    let result = client.try_set_donation_page(&creator, &config);
    assert!(result.is_err());
}

#[test]
fn test_donation_page_validation_too_many_amounts() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator, "creator");

    // More than 6 suggested amounts
    let config = DonationPageConfig {
        welcome_message: String::from_str(&env, "Support!"),
        suggested_amounts: vec![
            &env, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000,
        ],
        theme_color: String::from_str(&env, "#ff6b6b"),
        header_image_uri: String::from_str(&env, ""),
        is_default: false,
    };

    let result = client.try_set_donation_page(&creator, &config);
    assert!(result.is_err());
}

#[test]
fn test_donation_page_update() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    register_creator(&client, &env, &creator, "creator");

    // Set initial config
    let config1 = DonationPageConfig {
        welcome_message: String::from_str(&env, "First message"),
        suggested_amounts: vec![&env, 5_000_000],
        theme_color: String::from_str(&env, "#ff6b6b"),
        header_image_uri: String::from_str(&env, ""),
        is_default: false,
    };
    client.set_donation_page(&creator, &config1);

    // Update config
    let config2 = DonationPageConfig {
        welcome_message: String::from_str(&env, "Updated message"),
        suggested_amounts: vec![&env, 10_000_000],
        theme_color: String::from_str(&env, "#00ff00"),
        header_image_uri: String::from_str(&env, "ipfs://QmNew"),
        is_default: false,
    };
    client.set_donation_page(&creator, &config2);

    let page = client.get_donation_page(&creator);
    assert_eq!(
        page.welcome_message,
        String::from_str(&env, "Updated message")
    );
    assert_eq!(page.theme_color, String::from_str(&env, "#00ff00"));
}
