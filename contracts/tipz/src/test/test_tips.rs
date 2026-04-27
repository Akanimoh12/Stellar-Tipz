//! Tests for tip record storage with temporary TTL (issue #10).
//!
//! Test cases covered:
//! - Successful tip (balance updates, XLM transfer, tip record created)
//! - Tip to unregistered creator → NotRegistered
//! - Tip amount = 0 → InvalidAmount
//! - Tip to self → CannotTipSelf
//! - Message length validation
//! - Multiple tips accumulate correctly
//! - Global stats update after tip
//! - Credit score recalculated after tip
//! - Leaderboard data updated after tip
//! - SAC custody / insufficient XLM / contract can release XLM (issue #13)

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, Map, String, Symbol};

use crate::errors::ContractError;
use crate::storage::DataKey;
use crate::token as xlm;
use crate::types::{Profile, Tip, VerificationStatus, VerificationType};
use crate::TipzContract;
use crate::TipzContractClient;

/// Helper: set up a test environment with the contract initialized
/// and a registered creator profile.
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

    // Register the Tipz contract
    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    // Register a Stellar Asset Contract for native XLM
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    // Initialize the contract
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200, &token_address);

    // Create a registered creator profile
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
        verification: crate::types::VerificationStatus::default(),
    };
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Profile(creator.clone()), &profile);
    });

    // Create a tipper with funds
    let tipper = Address::generate(&env);
    token_admin_client.mint(&tipper, &100_000_000_000); // 10,000 XLM

    (env, client, contract_id, tipper, creator, token_address)
}

#[test]
fn test_send_tip_success() {
    let (env, client, contract_id, tipper, creator, sac) = setup_env();

    let token_client = token::TokenClient::new(&env, &sac);
    let tipper_before = token_client.balance(&tipper);

    let message = String::from_str(&env, "Great work!");
    let amount: i128 = 10_000_000; // 1 XLM

    client.send_tip(&tipper, &creator, &amount, &message, &false);

    // Verify XLM was transferred from tipper to the contract
    assert_eq!(token_client.balance(&tipper), tipper_before - amount);
    assert_eq!(token_client.balance(&contract_id), amount);

    // Verify creator's profile was updated
    env.as_contract(&contract_id, || {
        let profile: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(creator.clone()))
            .unwrap();
        assert_eq!(profile.balance, amount);
        assert_eq!(profile.total_tips_received, amount);
        assert_eq!(profile.total_tips_count, 1);
    });

    // Verify tip record was created in temporary storage
    env.as_contract(&contract_id, || {
        let tip: Tip = env.storage().temporary().get(&DataKey::Tip(0)).unwrap();
        assert_eq!(tip.id, 0);
        assert_eq!(tip.tipper, Some(tipper));
        assert_eq!(tip.creator, creator);
        assert_eq!(tip.amount, amount);
    });

    // Verify global stats were updated
    env.as_contract(&contract_id, || {
        let tip_count: u32 = env.storage().instance().get(&DataKey::TipCount).unwrap();
        assert_eq!(tip_count, 1);
        let total_volume: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalTipsVolume)
            .unwrap();
        assert_eq!(total_volume, amount);
    });
}

#[test]
fn test_send_tip_updates_credit_score() {
    let (env, client, contract_id, tipper, creator, _sac) = setup_env();

    // Tip 50 XLM (500_000_000 stroops):
    //   tip_sub  = 500_000_000 / 10_000_000 = 50
    //   tip_pts  = 50 * 20 / 100            = 10
    //   score    = BASE_SCORE(40) + 10       = 50
    let amount: i128 = 500_000_000;
    let message = String::from_str(&env, "great content");

    client.send_tip(&tipper, &creator, &amount, &message, &false);

    // calculate_credit_score recalculates and persists the score
    let score = client.calculate_credit_score(&creator);
    assert_eq!(score, 50);

    // Verify the persisted profile reflects the updated credit score
    env.as_contract(&contract_id, || {
        let profile: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(creator.clone()))
            .unwrap();
        assert_eq!(profile.credit_score, 50);
        assert_eq!(profile.total_tips_received, amount);
    });
}

#[test]
fn test_send_tip_self() {
    let (env, client, contract_id, _tipper, _creator, _sac) = setup_env();

    // Register a self-tipper as a creator
    let self_tipper = Address::generate(&env);
    let now = env.ledger().timestamp();
    let profile = Profile {
        owner: self_tipper.clone(),
        username: String::from_str(&env, "bob"),
        display_name: String::from_str(&env, "Bob"),
        bio: String::from_str(&env, ""),
        website: String::from_str(&env, ""),
        image_url: String::from_str(&env, ""),
        social_links: Map::<Symbol, String>::new(&env),
        x_handle: String::from_str(&env, ""),
        x_followers: 0,
        x_engagement_avg: 0,
        credit_score: 0,
        total_tips_received: 0,
        total_tips_count: 0,
        balance: 0,
        registered_at: now,
        updated_at: now,
        verification: crate::types::VerificationStatus::default(),
    };
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Profile(self_tipper.clone()), &profile);
    });

    let message = String::from_str(&env, "Self tip");
    let result = client.try_send_tip(&self_tipper, &self_tipper, &10_000_000, &message, &false);
    assert_eq!(result, Err(Ok(ContractError::CannotTipSelf)));
}

#[test]
fn test_send_tip_unregistered_creator() {
    let (env, client, _contract_id, tipper, _creator, _sac) = setup_env();

    let unregistered = Address::generate(&env);
    let message = String::from_str(&env, "Hello");

    let result = client.try_send_tip(&tipper, &unregistered, &10_000_000, &message, &false);
    assert_eq!(result, Err(Ok(ContractError::NotRegistered)));
}

#[test]
fn test_send_tip_zero_amount() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    let message = String::from_str(&env, "Zero tip");
    let result = client.try_send_tip(&tipper, &creator, &0, &message, &false);
    assert_eq!(result, Err(Ok(ContractError::InvalidAmount)));
}

#[test]
fn test_send_tip_invalid_amount_negative() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    let message = String::from_str(&env, "Negative tip");
    let result = client.try_send_tip(&tipper, &creator, &-1, &message, &false);
    assert_eq!(result, Err(Ok(ContractError::InvalidAmount)));
}

#[test]
fn test_send_tip_message_too_long() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    // 281 characters — one over the 280-character limit
    let long_msg = String::from_str(
        &env,
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    let result = client.try_send_tip(&tipper, &creator, &10_000_000, &long_msg, &false);
    assert_eq!(result, Err(Ok(ContractError::MessageTooLong)));
}

#[test]
fn test_send_tip_insufficient_xlm() {
    let (env, client, _contract_id, _tipper, creator, _sac) = setup_env();

    let broke = Address::generate(&env);
    let message = String::from_str(&env, "no funds");
    let result = client.try_send_tip(&broke, &creator, &10_000_000, &message, &false);
    assert_eq!(result, Err(Ok(ContractError::InsufficientBalance)));
}

#[test]
fn test_send_tip_multiple() {
    let (env, client, contract_id, tipper, creator, _sac) = setup_env();

    let message = String::from_str(&env, "Tip!");
    let amount: i128 = 5_000_000;

    // Send 3 tips
    client.send_tip(&tipper, &creator, &amount, &message, &false);
    client.send_tip(&tipper, &creator, &amount, &message, &false);
    client.send_tip(&tipper, &creator, &amount, &message, &false);

    // Verify accumulated balance and counts
    env.as_contract(&contract_id, || {
        let profile: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(creator.clone()))
            .unwrap();
        assert_eq!(profile.balance, amount * 3);
        assert_eq!(profile.total_tips_received, amount * 3);
        assert_eq!(profile.total_tips_count, 3);
    });

    // Verify global counters
    env.as_contract(&contract_id, || {
        let tip_count: u32 = env.storage().instance().get(&DataKey::TipCount).unwrap();
        assert_eq!(tip_count, 3);
        let total_volume: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalTipsVolume)
            .unwrap();
        assert_eq!(total_volume, amount * 3);
    });

    // Verify each individual tip record exists
    env.as_contract(&contract_id, || {
        for i in 0..3u32 {
            let tip: Tip = env.storage().temporary().get(&DataKey::Tip(i)).unwrap();
            assert_eq!(tip.amount, amount);
        }
    });
}

#[test]
fn test_send_tip_updates_leaderboard() {
    let (env, client, contract_id, tipper, creator, _sac) = setup_env();

    // Register a second creator
    let creator2 = Address::generate(&env);
    let now = env.ledger().timestamp();
    let profile2 = Profile {
        owner: creator2.clone(),
        username: String::from_str(&env, "bob"),
        display_name: String::from_str(&env, "Bob"),
        bio: String::from_str(&env, ""),
        website: String::from_str(&env, ""),
        image_url: String::from_str(&env, ""),
        social_links: Map::<Symbol, String>::new(&env),
        x_handle: String::from_str(&env, ""),
        x_followers: 0,
        x_engagement_avg: 0,
        credit_score: 0,
        total_tips_received: 0,
        total_tips_count: 0,
        balance: 0,
        registered_at: now,
        updated_at: now,
        verification: crate::types::VerificationStatus::default(),
    };
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Profile(creator2.clone()), &profile2);
    });

    let message = String::from_str(&env, "tip");

    // creator1 receives 20 XLM, creator2 receives 10 XLM
    client.send_tip(&tipper, &creator, &200_000_000, &message, &false);
    client.send_tip(&tipper, &creator2, &100_000_000, &message, &false);

    // Verify leaderboard data — total_tips_received correctly reflects
    // each creator's rank. The full leaderboard sort/query is in issue #17.
    env.as_contract(&contract_id, || {
        let p1: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(creator.clone()))
            .unwrap();
        let p2: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(creator2.clone()))
            .unwrap();
        assert_eq!(p1.total_tips_received, 200_000_000);
        assert_eq!(p2.total_tips_received, 100_000_000);
        // creator1 has received more, so would rank higher on the leaderboard
        assert!(p1.total_tips_received > p2.total_tips_received);
    });

    // Global tip count reflects all tips sent
    env.as_contract(&contract_id, || {
        let tip_count: u32 = env.storage().instance().get(&DataKey::TipCount).unwrap();
        assert_eq!(tip_count, 2);
    });
}

#[test]
fn test_send_tip_updates_leaderboard_once() {
    let (env, client, contract_id, tipper, creator, _sac) = setup_env();

    let message = String::from_str(&env, "tip");
    let amount: i128 = 100_000_000;

    client.send_tip(&tipper, &creator, &amount, &message, &false);

    env.as_contract(&contract_id, || {
        let entries = crate::leaderboard::get_leaderboard(&env, 0);
        assert_eq!(entries.len(), 1);
        let entry = entries.get(0).unwrap();
        assert_eq!(entry.address, creator);
        assert_eq!(entry.total_tips_received, amount);

        let profile: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(entry.address.clone()))
            .unwrap();
        assert_eq!(profile.total_tips_received, amount);
        assert_eq!(profile.total_tips_count, 1);
    });
}

#[test]
fn test_send_tip_empty_message_allowed() {
    let (env, client, contract_id, tipper, creator, _sac) = setup_env();

    let message = String::from_str(&env, "");
    let amount: i128 = 10_000_000;

    client.send_tip(&tipper, &creator, &amount, &message, &false);

    env.as_contract(&contract_id, || {
        let profile: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(creator.clone()))
            .unwrap();
        assert_eq!(profile.balance, amount);
    });
}

#[test]
fn test_send_tip_contract_sac_holds_transferred_xlm() {
    let (env, client, contract_id, tipper, creator, sac) = setup_env();

    let token_client = token::TokenClient::new(&env, &sac);
    let before = token_client.balance(&contract_id);
    let amount: i128 = 10_000_000;
    let message = String::from_str(&env, "custody");

    client.send_tip(&tipper, &creator, &amount, &message, &false);

    let after = token_client.balance(&contract_id);
    assert_eq!(after - before, amount);
}

#[test]
fn test_native_token_address_matches_initialized_sac() {
    let (env, _client, contract_id, _tipper, _creator, sac) = setup_env();

    env.as_contract(&contract_id, || {
        assert_eq!(xlm::native_token_address(&env), sac);
    });
}

#[test]
fn test_transfer_xlm_contract_can_release_xlm() {
    let (env, _client, contract_id, _tipper, _creator, sac) = setup_env();

    let recipient = Address::generate(&env);
    let asset = token::StellarAssetClient::new(&env, &sac);
    asset.mint(&contract_id, &80_000_000);

    let token_client = token::TokenClient::new(&env, &sac);
    assert_eq!(token_client.balance(&contract_id), 80_000_000);

    env.as_contract(&contract_id, || {
        xlm::transfer_xlm(&env, &contract_id, &recipient, 30_000_000).unwrap();
    });

    assert_eq!(token_client.balance(&recipient), 30_000_000);
    assert_eq!(token_client.balance(&contract_id), 50_000_000);
}

// ── get_tips_by_tipper ──────────────────────────────────────────────────────

#[test]
fn test_get_tips_by_tipper_returns_correct_tips() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    let msg1 = String::from_str(&env, "tip 1");
    let msg2 = String::from_str(&env, "tip 2");
    let msg3 = String::from_str(&env, "tip 3");

    client.send_tip(&tipper, &creator, &10_000_000, &msg1, &false);
    client.send_tip(&tipper, &creator, &20_000_000, &msg2, &false);
    client.send_tip(&tipper, &creator, &30_000_000, &msg3, &false);

    let tips = client.get_tips_by_tipper(&tipper, &10);
    assert_eq!(tips.len(), 3);

    // Reverse chronological order: newest first
    assert_eq!(tips.get(0).unwrap().amount, 30_000_000);
    assert_eq!(tips.get(1).unwrap().amount, 20_000_000);
    assert_eq!(tips.get(2).unwrap().amount, 10_000_000);
}

#[test]
fn test_get_tips_by_tipper_respects_limit() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    let msg = String::from_str(&env, "tip");
    client.send_tip(&tipper, &creator, &10_000_000, &msg, &false);
    client.send_tip(&tipper, &creator, &20_000_000, &msg, &false);
    client.send_tip(&tipper, &creator, &30_000_000, &msg, &false);

    let tips = client.get_tips_by_tipper(&tipper, &2);
    assert_eq!(tips.len(), 2);
    // Most recent two
    assert_eq!(tips.get(0).unwrap().amount, 30_000_000);
    assert_eq!(tips.get(1).unwrap().amount, 20_000_000);
}

#[test]
fn test_get_tips_by_tipper_empty_for_unknown() {
    let (env, client, _contract_id, _tipper, _creator, _sac) = setup_env();

    let stranger = Address::generate(&env);
    let tips = client.get_tips_by_tipper(&stranger, &10);
    assert_eq!(tips.len(), 0);
}

#[test]
fn test_get_tipper_tip_count() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    assert_eq!(client.get_tipper_tip_count(&tipper), 0);

    let msg = String::from_str(&env, "tip");
    client.send_tip(&tipper, &creator, &10_000_000, &msg, &false);
    assert_eq!(client.get_tipper_tip_count(&tipper), 1);

    client.send_tip(&tipper, &creator, &20_000_000, &msg, &false);
    assert_eq!(client.get_tipper_tip_count(&tipper), 2);
}

#[test]
fn test_get_tips_by_tipper_isolates_tippers() {
    let (env, client, _contract_id, tipper, creator, sac) = setup_env();

    // Fund a second tipper
    let tipper2 = Address::generate(&env);
    let asset = token::StellarAssetClient::new(&env, &sac);
    asset.mint(&tipper2, &100_000_000_000);

    let msg = String::from_str(&env, "tip");
    client.send_tip(&tipper, &creator, &10_000_000, &msg, &false);
    client.send_tip(&tipper2, &creator, &20_000_000, &msg, &false);
    client.send_tip(&tipper, &creator, &30_000_000, &msg, &false);

    let tips1 = client.get_tips_by_tipper(&tipper, &10);
    assert_eq!(tips1.len(), 2);
    assert_eq!(tips1.get(0).unwrap().amount, 30_000_000);
    assert_eq!(tips1.get(1).unwrap().amount, 10_000_000);

    let tips2 = client.get_tips_by_tipper(&tipper2, &10);
    assert_eq!(tips2.len(), 1);
    assert_eq!(tips2.get(0).unwrap().amount, 20_000_000);
}

// ── get_recent_tips pagination ──────────────────────────────────────────────

#[test]
fn test_get_recent_tips_returns_newest_first() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    let msg = String::from_str(&env, "tip");
    client.send_tip(&tipper, &creator, &10_000_000, &msg, &false);
    client.send_tip(&tipper, &creator, &20_000_000, &msg, &false);
    client.send_tip(&tipper, &creator, &30_000_000, &msg, &false);

    let tips = client.get_recent_tips(&creator, &10, &0);
    assert_eq!(tips.len(), 3);
    assert_eq!(tips.get(0).unwrap().amount, 30_000_000);
    assert_eq!(tips.get(1).unwrap().amount, 20_000_000);
    assert_eq!(tips.get(2).unwrap().amount, 10_000_000);
}

#[test]
fn test_get_recent_tips_offset_skips_newest() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    let msg = String::from_str(&env, "tip");
    client.send_tip(&tipper, &creator, &10_000_000, &msg, &false);
    client.send_tip(&tipper, &creator, &20_000_000, &msg, &false);
    client.send_tip(&tipper, &creator, &30_000_000, &msg, &false);
    client.send_tip(&tipper, &creator, &40_000_000, &msg, &false);

    // Skip the 2 newest, get next 2
    let tips = client.get_recent_tips(&creator, &2, &2);
    assert_eq!(tips.len(), 2);
    assert_eq!(tips.get(0).unwrap().amount, 20_000_000);
    assert_eq!(tips.get(1).unwrap().amount, 10_000_000);
}

#[test]
fn test_get_recent_tips_limit_capped_at_50() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    let msg = String::from_str(&env, "tip");
    // Send 3 tips but request 100 — should return all 3 (capped internally)
    client.send_tip(&tipper, &creator, &10_000_000, &msg, &false);
    client.send_tip(&tipper, &creator, &20_000_000, &msg, &false);
    client.send_tip(&tipper, &creator, &30_000_000, &msg, &false);

    let tips = client.get_recent_tips(&creator, &100, &0);
    assert_eq!(tips.len(), 3);
}

#[test]
fn test_get_recent_tips_offset_beyond_count_returns_empty() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    let msg = String::from_str(&env, "tip");
    client.send_tip(&tipper, &creator, &10_000_000, &msg, &false);

    let tips = client.get_recent_tips(&creator, &10, &100);
    assert_eq!(tips.len(), 0);
}

#[test]
fn test_get_recent_tips_empty_for_no_tips() {
    let (_env, client, _contract_id, _tipper, creator, _sac) = setup_env();

    let tips = client.get_recent_tips(&creator, &10, &0);
    assert_eq!(tips.len(), 0);
}

#[test]
fn test_get_creator_tip_count() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    assert_eq!(client.get_creator_tip_count(&creator), 0);

    let msg = String::from_str(&env, "tip");
    client.send_tip(&tipper, &creator, &10_000_000, &msg, &false);
    assert_eq!(client.get_creator_tip_count(&creator), 1);

    client.send_tip(&tipper, &creator, &20_000_000, &msg, &false);
    assert_eq!(client.get_creator_tip_count(&creator), 2);
}

#[test]
fn test_get_recent_tips_pagination_full_walk() {
    let (env, client, _contract_id, tipper, creator, _sac) = setup_env();

    let msg = String::from_str(&env, "tip");
    // Send 5 tips
    for i in 1..=5 {
        client.send_tip(&tipper, &creator, &(i * 10_000_000), &msg, &false);
    }

    // Page 1: offset 0, limit 2 → tips 5, 4
    let page1 = client.get_recent_tips(&creator, &2, &0);
    assert_eq!(page1.len(), 2);
    assert_eq!(page1.get(0).unwrap().amount, 50_000_000);
    assert_eq!(page1.get(1).unwrap().amount, 40_000_000);

    // Page 2: offset 2, limit 2 → tips 3, 2
    let page2 = client.get_recent_tips(&creator, &2, &2);
    assert_eq!(page2.len(), 2);
    assert_eq!(page2.get(0).unwrap().amount, 30_000_000);
    assert_eq!(page2.get(1).unwrap().amount, 20_000_000);

    // Page 3: offset 4, limit 2 → tip 1
    let page3 = client.get_recent_tips(&creator, &2, &4);
    assert_eq!(page3.len(), 1);
    assert_eq!(page3.get(0).unwrap().amount, 10_000_000);

    // Page 4: offset 5, limit 2 → empty
    let page4 = client.get_recent_tips(&creator, &2, &5);
    assert_eq!(page4.len(), 0);
}
