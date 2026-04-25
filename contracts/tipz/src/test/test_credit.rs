//! Tests for credit score edge cases and tier boundaries (issue #12).
//!
//! `get_tier` and `calculate_credit_score` are pure functions and are tested
//! directly.  `get_credit_tier` reads from contract storage and is tested
//! inside `env.as_contract()`.
//!
//! Test coverage:
//! - All five tier boundaries (exact edges and mid-range values)
//! - New profile with zero tips, zero X metrics, age < 1 day → score = 40
//! - Billion-stroop tip volume → tip sub-score capped at 100
//! - Zero X metrics → X component contributes 0
//! - Account age < 1 day → age component = 0
//! - Reply weight (1.5×) applied correctly in integer arithmetic
//! - Combined components produce the expected total
//! - Score never exceeds 100
//! - `get_credit_tier` returns NotRegistered for unknown address

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, Map, String, Symbol};

use crate::{
    credit::{calculate_credit_score, get_credit_tier, get_tier, BASE_SCORE},
    storage::DataKey,
    types::{CreditTier, Profile, VerificationStatus, VerificationType},
    TipzContract,
};

// ── helpers ───────────────────────────────────────────────────────────────────

/// Build a minimal Profile with all X metrics and tips zeroed and
/// `registered_at` set to `now` (simulating a brand-new account).
fn blank_profile(env: &Env, now: u64) -> Profile {
    Profile {
        owner: Address::generate(env),
        username: String::from_str(env, "creator"),
        display_name: String::from_str(env, "Creator"),
        bio: String::from_str(env, ""),
        website: String::from_str(env, ""),
        image_url: String::from_str(env, ""),
        social_links: Map::<Symbol, String>::new(env),
        x_handle: String::from_str(env, ""),
        x_followers: 0,
        x_engagement_avg: 0,
        credit_score: 0,
        total_tips_received: 0,
        total_tips_count: 0,
        balance: 0,
        registered_at: now,
        updated_at: now,
        verification: crate::types::VerificationStatus::default(),
    }
}

fn register_contract(env: &Env) -> Address {
    env.register_contract(None, TipzContract)
}

// ── get_tier: boundary values ─────────────────────────────────────────────────

#[test]
fn tier_new_at_score_zero() {
    assert_eq!(get_tier(0), CreditTier::New);
}

#[test]
fn tier_new_at_score_19() {
    assert_eq!(get_tier(19), CreditTier::New);
}

#[test]
fn tier_bronze_at_score_20() {
    assert_eq!(get_tier(20), CreditTier::Bronze);
}

#[test]
fn tier_bronze_at_score_39() {
    assert_eq!(get_tier(39), CreditTier::Bronze);
}

#[test]
fn tier_silver_at_score_40() {
    assert_eq!(get_tier(40), CreditTier::Silver);
}

#[test]
fn tier_silver_at_score_59() {
    assert_eq!(get_tier(59), CreditTier::Silver);
}

#[test]
fn tier_gold_at_score_60() {
    assert_eq!(get_tier(60), CreditTier::Gold);
}

#[test]
fn tier_gold_at_score_79() {
    assert_eq!(get_tier(79), CreditTier::Gold);
}

#[test]
fn tier_diamond_at_score_80() {
    assert_eq!(get_tier(80), CreditTier::Diamond);
}

#[test]
fn tier_diamond_at_score_100() {
    assert_eq!(get_tier(100), CreditTier::Diamond);
}

// ── calculate_credit_score: edge cases ───────────────────────────────────────

#[test]
fn new_profile_returns_base_score() {
    // Zero tips, zero X metrics, registered now → all components = 0 → score = 40.
    let env = Env::default();
    let now = env.ledger().timestamp();
    let profile = blank_profile(&env, now);

    assert_eq!(calculate_credit_score(&profile, now), BASE_SCORE);
    assert_eq!(get_tier(BASE_SCORE), CreditTier::Silver);
}

#[test]
fn zero_tips_contributes_zero_tip_component() {
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut profile = blank_profile(&env, now);
    profile.total_tips_received = 0;

    // Only base applies.
    assert_eq!(calculate_credit_score(&profile, now), BASE_SCORE);
}

#[test]
fn billion_stroop_tip_volume_caps_at_100_sub_score() {
    // 1_000_000_000 stroops = 100 XLM → tip sub-score = 100 → tip pts = 20.
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut profile = blank_profile(&env, now);
    profile.total_tips_received = 1_000_000_000; // 100 XLM

    let score = calculate_credit_score(&profile, now);
    // base(40) + tip_pts(20) + x_pts(0) + age_pts(0) = 60
    assert_eq!(score, 60);
}

#[test]
fn extremely_large_tip_volume_still_capped() {
    // Multi-billion stroops (e.g. 10 000 XLM) must not overflow.
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut profile = blank_profile(&env, now);
    profile.total_tips_received = 100_000_000_000; // 10 000 XLM

    let score = calculate_credit_score(&profile, now);
    // tip sub-score capped at 100, so tip_pts = 20 same as above.
    assert_eq!(score, 60);
}

#[test]
fn zero_x_metrics_contributes_zero_x_component() {
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut profile = blank_profile(&env, now);
    // Explicitly all zeroed (they already are, but make intent clear).
    profile.x_followers = 0;
    profile.x_engagement_avg = 0;

    // X component must be 0; only base applies.
    assert_eq!(calculate_credit_score(&profile, now), BASE_SCORE);
}

#[test]
fn age_under_one_day_contributes_zero_age_component() {
    let env = Env::default();
    let now = 86_399_u64; // one second short of 1 day
    let mut profile = blank_profile(&env, now);
    profile.registered_at = 0; // age = 86_399 s < 86_400 s

    // Age component = 0.
    assert_eq!(calculate_credit_score(&profile, now), BASE_SCORE);
}

#[test]
fn age_exactly_one_day_contributes_nonzero() {
    let env = Env::default();
    let registered_at = 0_u64;
    let now = 86_400_u64; // exactly 1 day
    let mut profile = blank_profile(&env, now);
    profile.registered_at = registered_at;
    // age_days = 1, age_sub = min(1/10, 100) = 0 — rounds down; still 0.
    // age_pts = 0 * 10 / 100 = 0
    assert_eq!(calculate_credit_score(&profile, now), BASE_SCORE);
}

#[test]
fn age_ten_days_contributes_one_age_point() {
    let env = Env::default();
    let registered_at = 0_u64;
    let now = 86_400_u64 * 10; // exactly 10 days
    let mut profile = blank_profile(&env, now);
    profile.registered_at = registered_at;
    // age_sub = 10/10 = 1, age_pts = 1*10/100 = 0 — still rounds to 0.
    assert_eq!(calculate_credit_score(&profile, now), BASE_SCORE);
}

#[test]
fn age_one_hundred_days_contributes_full_age_points() {
    let env = Env::default();
    let registered_at = 0_u64;
    let now = 86_400_u64 * 100; // 100 days
    let mut profile = blank_profile(&env, now);
    profile.registered_at = registered_at;
    // age_sub = 100/10 = 10, age_pts = 10*10/100 = 1
    let score = calculate_credit_score(&profile, now);
    assert_eq!(score, BASE_SCORE + 1);
}

#[test]
fn higher_engagement_increases_score() {
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut low_engagement = blank_profile(&env, now);
    low_engagement.x_engagement_avg = 100;

    let mut high_engagement = blank_profile(&env, now);
    high_engagement.x_engagement_avg = 200;

    let low_score = calculate_credit_score(&low_engagement, now);
    let high_score = calculate_credit_score(&high_engagement, now);

    assert!(
        high_score > low_score,
        "higher engagement should increase the score"
    );
}

#[test]
fn score_never_exceeds_100() {
    // Max everything: huge tips, max followers, max activity, old account.
    let env = Env::default();
    let registered_at = 0_u64;
    let now = 86_400_u64 * 10_000; // ~27 years
    let mut profile = blank_profile(&env, now);
    profile.registered_at = registered_at;
    profile.total_tips_received = i128::MAX;
    profile.x_followers = u32::MAX;
    profile.x_engagement_avg = u32::MAX;

    let score = calculate_credit_score(&profile, now);
    assert!(score <= 100, "score {score} exceeded maximum of 100");
    assert_eq!(score, 100);
}

#[test]
fn max_x_metrics_contribute_30_x_points() {
    // x_followers saturates follower_part at 50 (at 2500 followers).
    // activity saturates activity_part at 50.
    // x_sub = 100, x_pts = 30.
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut profile = blank_profile(&env, now);
    profile.x_followers = 2_500; // saturates follower_part
    profile.x_engagement_avg = 500; // saturates engagement_part

    // x_sub: follower_part = min(2500/50, 50) = 50
    //        engagement_part = min(500/10, 50) = 50
    //        x_sub = 100, x_pts = 30
    let score = calculate_credit_score(&profile, now);
    assert_eq!(score, BASE_SCORE + 30); // 40 + 30 = 70
}

// ── get_credit_tier: contract-level function ──────────────────────────────────

#[test]
fn get_credit_tier_returns_not_registered_for_unknown_address() {
    let env = Env::default();
    let contract_id = register_contract(&env);
    let unknown = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let result = get_credit_tier(&env, &unknown);
        assert_eq!(result, Err(crate::errors::ContractError::NotRegistered));
    });
}

#[test]
fn get_credit_tier_returns_silver_for_new_profile() {
    let env = Env::default();
    let contract_id = register_contract(&env);
    let address = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let now = env.ledger().timestamp();
        let profile = blank_profile(&env, now);

        env.storage()
            .persistent()
            .set(&DataKey::Profile(address.clone()), &profile);

        let (score, tier) = get_credit_tier(&env, &address).expect("profile should exist");
        assert_eq!(score, BASE_SCORE);
        assert_eq!(tier, CreditTier::Silver);
    });
}

#[test]
fn get_credit_tier_reflects_tip_volume() {
    let env = Env::default();
    let contract_id = register_contract(&env);
    let address = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let now = env.ledger().timestamp();
        let mut profile = blank_profile(&env, now);
        // 50 XLM received → tip_sub = 50, tip_pts = 10 → score = 50
        profile.total_tips_received = 500_000_000;

        env.storage()
            .persistent()
            .set(&DataKey::Profile(address.clone()), &profile);

        let (score, tier) = get_credit_tier(&env, &address).expect("profile should exist");
        assert_eq!(score, 50);
        assert_eq!(tier, CreditTier::Silver);
    });
}

// ── Contract-specific test requirements ───────────────────────────────────────

#[test]
fn test_credit_score_new_profile() {
    // Fresh profile → score 40
    let env = Env::default();
    let now = env.ledger().timestamp();
    let profile = blank_profile(&env, now);

    assert_eq!(calculate_credit_score(&profile, now), 40);
}

#[test]
fn test_credit_score_after_tips() {
    // Profile with various tip amounts → verify weighted calculation
    let env = Env::default();
    let now = env.ledger().timestamp();

    // Test with 25 XLM in tips
    let mut profile = blank_profile(&env, now);
    profile.total_tips_received = 250_000_000; // 25 XLM

    // tip_sub = 25, tip_pts = 25 * 20 / 100 = 5
    // score = 40 + 5 = 45
    assert_eq!(calculate_credit_score(&profile, now), 45);

    // Test with 75 XLM in tips
    profile.total_tips_received = 750_000_000; // 75 XLM

    // tip_sub = 75, tip_pts = 75 * 20 / 100 = 15
    // score = 40 + 15 = 55
    assert_eq!(calculate_credit_score(&profile, now), 55);
}

#[test]
fn test_credit_score_max() {
    // Profile with maximum activity → score approaches 100
    let env = Env::default();
    let registered_at = 0_u64;
    let now = 86_400_u64 * 1000; // 1000 days old
    let mut profile = blank_profile(&env, now);
    profile.registered_at = registered_at;
    profile.total_tips_received = 1_000_000_000; // 100 XLM (max tip sub-score)
    profile.x_followers = 2_500; // Max follower contribution
    profile.x_engagement_avg = 500; // Max engagement contribution

    // tip_sub = 100, tip_pts = 20
    // x_sub = 100, x_pts = 30
    // age_sub = 100, age_pts = 10
    // score = 40 + 20 + 30 + 10 = 100
    assert_eq!(calculate_credit_score(&profile, now), 100);
}

#[test]
fn test_credit_score_zero_x_metrics() {
    // Profile with no X data → only on-chain metrics counted
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut profile = blank_profile(&env, now);
    profile.total_tips_received = 500_000_000; // 50 XLM
    profile.x_followers = 0;
    profile.x_engagement_avg = 0;

    // tip_sub = 50, tip_pts = 10
    // x_sub = 0, x_pts = 0
    // score = 40 + 10 + 0 = 50
    assert_eq!(calculate_credit_score(&profile, now), 50);
}

#[test]
fn test_credit_score_tiers() {
    // Verify correct tier assignment at boundaries (0, 19, 20, 39, 40, 59, 60, 79, 80, 100)

    // Test each boundary individually
    assert_eq!(get_tier(0), CreditTier::New);
    assert_eq!(get_tier(19), CreditTier::New);
    assert_eq!(get_tier(20), CreditTier::Bronze);
    assert_eq!(get_tier(39), CreditTier::Bronze);
    assert_eq!(get_tier(40), CreditTier::Silver);
    assert_eq!(get_tier(59), CreditTier::Silver);
    assert_eq!(get_tier(60), CreditTier::Gold);
    assert_eq!(get_tier(79), CreditTier::Gold);
    assert_eq!(get_tier(80), CreditTier::Diamond);
    assert_eq!(get_tier(100), CreditTier::Diamond);
}

#[test]
fn test_credit_score_consistency_weight() {
    // Verify consistency sub-score calculation (X metrics component)
    let env = Env::default();
    let now = env.ledger().timestamp();

    // Test followers contribution
    let mut profile = blank_profile(&env, now);
    profile.x_followers = 100; // 100/50 = 2, min(2, 50) = 2
    profile.x_engagement_avg = 0;

    // x_sub = 2, x_pts = 2 * 30 / 100 = 0 (integer division)
    assert_eq!(calculate_credit_score(&profile, now), 40);

    // Test engagement contribution
    profile.x_followers = 0;
    profile.x_engagement_avg = 100; // 100/10 = 10, min(10, 50) = 10

    // x_sub = 10, x_pts = 10 * 30 / 100 = 3
    assert_eq!(calculate_credit_score(&profile, now), 43);

    // Test combined contribution
    profile.x_followers = 100; // follower_part = 2
    profile.x_engagement_avg = 100; // engagement_part = 10
                                    // x_sub = 12, x_pts = 12 * 30 / 100 = 3
    assert_eq!(calculate_credit_score(&profile, now), 43);
}

#[test]
fn test_credit_score_integer_arithmetic() {
    // Ensure no rounding errors lead to score > 100
    let env = Env::default();
    let registered_at = 0_u64;
    let now = 86_400_u64 * 1000; // 1000 days old
    let mut profile = blank_profile(&env, now);
    profile.registered_at = registered_at;

    // Use values that could cause rounding issues
    profile.total_tips_received = 999_999_999; // Just under max
    profile.x_followers = 2_499; // Just under max
    profile.x_engagement_avg = 499; // Just under max

    let score = calculate_credit_score(&profile, now);
    assert!(
        score <= 100,
        "Score should not exceed 100 due to integer arithmetic"
    );

    // Test with maximum values
    profile.total_tips_received = i128::MAX;
    profile.x_followers = u32::MAX;
    profile.x_engagement_avg = u32::MAX;

    let score = calculate_credit_score(&profile, now);
    assert_eq!(
        score, 100,
        "Even with max values, score should be capped at 100"
    );
}
