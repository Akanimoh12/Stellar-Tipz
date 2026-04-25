//! Tests for platform analytics and statistics

use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

use crate::test::test_init::setup_test_contract;
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

fn fund_tipper(client: &TipzContractClient, env: &Env, tipper: &Address) {
    let token = client.get_config().native_token;
    token::StellarAssetClient::new(env, &token).mint(tipper, &100_000_000);
}

#[test]
fn test_platform_stats() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);
    let creator3 = Address::generate(&env);
    let tipper = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    fund_tipper(&client, &env, &tipper);

    // Register 3 creators
    register_creator(&client, &env, &creator1, "creator1");
    register_creator(&client, &env, &creator2, "creator2");
    register_creator(&client, &env, &creator3, "creator3");

    // Send 5 tips
    client.send_tip(
        &tipper,
        &creator1,
        &1_000_000,
        &String::from_str(&env, "tip1"),
        &false,
    );
    client.send_tip(
        &tipper,
        &creator2,
        &2_000_000,
        &String::from_str(&env, "tip2"),
        &false,
    );
    client.send_tip(
        &tipper,
        &creator1,
        &3_000_000,
        &String::from_str(&env, "tip3"),
        &false,
    );
    client.send_tip(
        &tipper,
        &creator3,
        &4_000_000,
        &String::from_str(&env, "tip4"),
        &false,
    );
    client.send_tip(
        &tipper,
        &creator2,
        &5_000_000,
        &String::from_str(&env, "tip5"),
        &false,
    );

    let stats = client.get_platform_stats();
    assert_eq!(stats.total_creators, 3);
    assert_eq!(stats.total_tips, 5);
    assert_eq!(stats.total_volume, 15_000_000);
}

#[test]
fn test_stats_update_on_tip() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    fund_tipper(&client, &env, &tipper);
    register_creator(&client, &env, &creator, "creator");

    let before = client.get_platform_stats();

    client.send_tip(
        &tipper,
        &creator,
        &1_000_000,
        &String::from_str(&env, "tip"),
        &false,
    );

    let after = client.get_platform_stats();
    assert_eq!(after.total_tips, before.total_tips + 1);
    assert_eq!(after.total_volume, before.total_volume + 1_000_000);
}

#[test]
fn test_creator_stats() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    fund_tipper(&client, &env, &tipper);
    register_creator(&client, &env, &creator, "creator");

    // Send tips
    client.send_tip(
        &tipper,
        &creator,
        &5_000_000,
        &String::from_str(&env, "tip1"),
        &false,
    );
    client.send_tip(
        &tipper,
        &creator,
        &10_000_000,
        &String::from_str(&env, "tip2"),
        &false,
    );

    let stats = client.get_creator_stats(&creator);
    assert_eq!(stats.total_tips_count, 2);
    assert_eq!(stats.total_tips_received, 15_000_000);
    assert_eq!(stats.balance, 15_000_000);
    assert!(stats.credit_score > 0);
}

#[test]
fn test_24h_stats_tracking() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    fund_tipper(&client, &env, &tipper);
    register_creator(&client, &env, &creator, "creator");

    // Send tip
    client.send_tip(
        &tipper,
        &creator,
        &1_000_000,
        &String::from_str(&env, "tip"),
        &false,
    );

    let stats = client.get_platform_stats();
    assert_eq!(stats.tips_last_24h, 1);
    assert_eq!(stats.volume_last_24h, 1_000_000);
}

#[test]
fn test_stats_after_withdrawal() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    fund_tipper(&client, &env, &tipper);
    register_creator(&client, &env, &creator, "creator");

    // Send tip
    client.send_tip(
        &tipper,
        &creator,
        &10_000_000,
        &String::from_str(&env, "tip"),
        &false,
    );

    // Withdraw
    client.withdraw_tips(&creator, &5_000_000);

    let stats = client.get_creator_stats(&creator);
    assert_eq!(stats.total_tips_received, 10_000_000); // Doesn't change
    assert!(stats.balance < 10_000_000); // Balance reduced
}

#[test]
fn test_platform_stats_multiple_creators() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let tipper = Address::generate(&env);

    let client = setup_test_contract(&env, &admin);
    fund_tipper(&client, &env, &tipper);
    let usernames = ["creator0", "creator1", "creator2", "creator3", "creator4"];

    // Register multiple creators and send tips
    for i in 0..5 {
        let creator = Address::generate(&env);
        register_creator(&client, &env, &creator, usernames[i]);

        client.send_tip(
            &tipper,
            &creator,
            &((i + 1) as i128 * 1_000_000),
            &String::from_str(&env, "tip"),
            &false,
        );
    }

    let stats = client.get_platform_stats();
    assert_eq!(stats.total_creators, 5);
    assert_eq!(stats.total_tips, 5);
    // 1M + 2M + 3M + 4M + 5M = 15M
    assert_eq!(stats.total_volume, 15_000_000);
}
