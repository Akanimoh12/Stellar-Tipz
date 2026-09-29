#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Env, String,
};

use crate::errors::ContractError;
use crate::storage::DataKey;
use crate::types::{Profile, Subscription};
use crate::TipzContract;
use crate::TipzContractClient;

fn setup_env() -> (
    Env,
    TipzContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200, &token_address);

    let creator = Address::generate(&env);
    let now = env.ledger().timestamp();
    let profile = Profile {
        owner: creator.clone(),
        username: String::from_str(&env, "alice"),
        display_name: String::from_str(&env, "Alice"),
        bio: String::from_str(&env, "Hello!"),
        website: String::from_str(&env, ""),
        social_links: soroban_sdk::Map::new(&env),
        image_url: String::from_str(&env, ""),
        x_handle: String::from_str(&env, "alice_x"),
        x_followers: 0,
        x_engagement_avg: 0,
        credit_score: 0,
        total_tips_received: 0,
        total_tips_count: 0,
        balance: 0,
        registered_at: now,
        updated_at: now,
        verification: crate::types::VerificationStatus {
            is_verified: false,
            verification_type: crate::types::VerificationType::Unverified,
            verified_at: None,
            revoked_at: None,
        },
        domain: String::from_str(&env, ""),
        domain_verified: false,
        domain_verified_at: None,
        custom_min_tip: None,
    };
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Profile(creator.clone()), &profile);
    });

    let subscriber = Address::generate(&env);
    token_admin_client.mint(&subscriber, &100_000_000_000);

    (env, client, contract_id, subscriber, creator, token_address)
}

#[test]
fn test_create_subscription() {
    let (env, client, _contract_id, subscriber, creator, _sac) = setup_env();

    let sub = client.create_subscription(&subscriber, &creator, &100_000_000, &7);
    assert!(sub.active);
    assert_eq!(sub.amount, 100_000_000);
    assert_eq!(sub.interval_days, 7);

    let subs = client.get_subscriptions(&subscriber);
    assert_eq!(subs.len(), 1);
}

#[test]
fn test_cancel_subscription() {
    let (env, client, _contract_id, subscriber, creator, _sac) = setup_env();

    client.create_subscription(&subscriber, &creator, &100_000_000, &7);
    client.cancel_subscription(&subscriber, &creator);

    let subs = client.get_subscriptions(&subscriber);
    assert_eq!(subs.len(), 1);
    assert!(!subs.get(0).unwrap().active);
}

#[test]
fn test_execute_due_subscription() {
    let (env, client, contract_id, subscriber, creator, sac) = setup_env();

    client.create_subscription(&subscriber, &creator, &100_000_000, &7);

    // Advance time
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + (8 * 86400));

    client.execute_due_subscription(&subscriber, &creator);

    let token_client = token::TokenClient::new(&env, &sac);
    assert_eq!(token_client.balance(&contract_id), 100_000_000);

    let profile = client.get_profile(&creator);
    assert_eq!(profile.profile.total_tips_received, 100_000_000);
}

#[test]
fn test_changes_preserve_period_and_last_change_wins() {
    let (env, client, contract_id, subscriber, creator, _) = setup_env();
    let original = client.create_subscription(&subscriber, &creator, &100_000_000, &7);
    env.ledger().set_timestamp(original.next_due - 1);
    // Upgrade and downgrade both leave current-period terms and date unchanged.
    for amount in [200_000_000_i128, 50_000_000_i128] {
        let current = client.create_subscription(&subscriber, &creator, &amount, &30);
        assert_eq!(current.amount, original.amount);
        assert_eq!(current.next_due, original.next_due);
        assert_eq!(current.interval_days, 7);
    }
    assert_eq!(client.get_subscriptions(&subscriber).len(), 1);
    env.as_contract(&contract_id, || {
        let pending: (i128, u32) = env
            .storage()
            .persistent()
            .get(&DataKey::SubscriptionChange(
                subscriber.clone(),
                creator.clone(),
            ))
            .unwrap();
        assert_eq!(pending, (50_000_000, 30));
    });
    env.ledger().set_timestamp(original.next_due);
    client.execute_due_subscription(&subscriber, &creator);
    let changed = client.get_subscriptions(&subscriber).get(0).unwrap();
    assert_eq!(changed.amount, 50_000_000);
    assert_eq!(changed.interval_days, 30);
    assert_eq!(changed.next_due, original.next_due + 30 * 86400);
}

#[test]
fn test_mid_period_cancel_discards_change_without_refund() {
    let (env, client, contract_id, subscriber, creator, sac) = setup_env();
    let sub = client.create_subscription(&subscriber, &creator, &100_000_000, &7);
    env.ledger().set_timestamp(sub.next_due);
    client.execute_due_subscription(&subscriber, &creator);
    let token_client = token::TokenClient::new(&env, &sac);
    let before = token_client.balance(&subscriber);
    env.ledger().set_timestamp(sub.next_due + 86400);
    client.create_subscription(&subscriber, &creator, &200_000_000, &30);
    client.cancel_subscription(&subscriber, &creator);
    assert_eq!(token_client.balance(&subscriber), before);
    env.as_contract(&contract_id, || {
        assert!(
            !env.storage().persistent().has(&DataKey::SubscriptionChange(
                subscriber.clone(),
                creator.clone()
            ))
        );
    });
    env.ledger().set_timestamp(sub.next_due + 30 * 86400);
    client.execute_due_subscription(&subscriber, &creator);
    assert_eq!(token_client.balance(&subscriber), before);
}

#[test]
fn test_rejects_zero_interval_and_overdue_change() {
    let (env, client, _, subscriber, creator, _) = setup_env();
    assert!(client
        .try_create_subscription(&subscriber, &creator, &100_000_000, &0)
        .is_err());
    let sub = client.create_subscription(&subscriber, &creator, &100_000_000, &7);
    env.ledger().set_timestamp(sub.next_due);
    assert!(client
        .try_create_subscription(&subscriber, &creator, &200_000_000, &30)
        .is_err());
}
