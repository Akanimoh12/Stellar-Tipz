//! Tests for supporter streak tracking.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, token, Address, Env, Map, String, Symbol};

use crate::credit::calculate_credit_score;
use crate::storage::DataKey;
use crate::token as xlm;
use crate::types::{Profile, VerificationStatus, VerificationType};
use crate::TipzContract;
use crate::TipzContractClient;

fn setup_env() -> (Env, TipzContractClient<'static>, Address, Address, Address, Address) {
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
        image_url: String::from_str(&env, ""),
        social_links: Map::<Symbol, String>::new(&env),
        x_handle: String::from_str(&env, "alice_x"),
        x_followers: 0,
        x_engagement_avg: 0,
        credit_score: 0,
        total_tips_received: 0,
        total_tips_count: 0,
        balance: 0,
        registered_at: now,
        updated_at: now,
        verification: VerificationStatus {
            is_verified: false,
            verification_type: VerificationType::Unverified,
            verified_at: None,
            revoked_at: None,
        },
    };

    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Profile(creator.clone()), &profile);
    });

    let tipper = Address::generate(&env);
    token_admin_client.mint(&tipper, &100_000_000_000);

    (env, client, contract_id, tipper, creator, token_address)
}

fn send_daily_tip(
    env: &Env,
    client: &TipzContractClient<'static>,
    tipper: &Address,
    creator: &Address,
    day: u64,
) {
    let timestamp = day * 86_400;
    env.ledger().set_timestamp(timestamp);
    let message = String::from_str(env, "keep it up");
    let amount: i128 = 50_000_000;
    client.send_tip(tipper, creator, &amount, &message, &false);
}

#[test]
fn test_streak_tracking() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    for day in 0..3 {
        send_daily_tip(&env, &client, &tipper, &creator, day);
    }

    let streak = client.get_streak(&tipper, &creator);
    assert_eq!(streak.current, 3);
    assert_eq!(streak.longest, 3);
    assert_eq!(streak.bonus_points, 0);
}

#[test]
fn test_streak_reset() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    send_daily_tip(&env, &client, &tipper, &creator, 0);
    send_daily_tip(&env, &client, &tipper, &creator, 3);

    let streak = client.get_streak(&tipper, &creator);
    assert_eq!(streak.current, 1);
    assert_eq!(streak.longest, 1);
}

#[test]
fn test_streak_bonus_updates_credit_score() {
    let (env, client, contract_id, tipper, creator, _sac) = setup_env();

    for day in 0..7 {
        send_daily_tip(&env, &client, &tipper, &creator, day);
    }

    let streak = client.get_streak(&tipper, &creator);
    assert_eq!(streak.current, 7);
    assert_eq!(streak.longest, 7);
    assert_eq!(streak.bonus_points, 1);

    let score = client.calculate_credit_score(&creator);
    let pure_score = env.as_contract(&contract_id, || {
        let profile: Profile = env.storage().persistent().get(&DataKey::Profile(creator.clone())).unwrap();
        calculate_credit_score(&profile, env.ledger().timestamp())
    });

    assert_eq!(score, pure_score + 1);
}
