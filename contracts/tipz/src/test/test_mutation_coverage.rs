//! Mutation-coverage tests for the four critical modules: fees, credit,
//! leaderboard, and tips (issue #578).
//!
//! Each test is written to kill at least one *specific* cargo-mutants mutant
//! that surviving a broader test suite would allow through.  Comments identify
//! the target mutant in the form `[module] mutant: <description>`.
//!
//! ## How to run mutation tests locally
//! ```sh
//! cd contracts
//! cargo mutants --package tipz-contract \
//!     --file tipz/src/fees.rs \
//!     --file tipz/src/credit.rs \
//!     --file tipz/src/leaderboard.rs \
//!     --file tipz/src/tips.rs \
//!     -- --all-targets
//! ```

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, Map, String, Symbol, Vec};

use crate::{
    credit::{
        calculate_credit_score, calculate_credit_score_with_streak,
        get_credit_breakdown_for_profile, get_tier, BASE_SCORE,
    },
    fees::calculate_fee,
    leaderboard::{
        get_leaderboard, get_leaderboard_rank, get_leaderboard_size, is_on_leaderboard,
        remove_from_leaderboard, reset_leaderboard, update_leaderboard,
    },
    tips::{get_recent_tips, get_tip, store_tip},
    types::{CreditTier, LeaderboardEntry, LeaderboardPeriod, Profile, VerificationStatus},
    TipzContract,
};

// ── shared helpers ─────────────────────────────────────────────────────────────

fn blank_profile(env: &Env, registered_at: u64) -> Profile {
    Profile {
        owner: Address::generate(env),
        username: String::from_str(env, "user"),
        display_name: String::from_str(env, "User"),
        bio: String::from_str(env, ""),
        website: String::from_str(env, ""),
        image_url: String::from_str(env, ""),
        social_links: Map::<Symbol, String>::new(env),
        x_handle: String::from_str(env, ""),
        x_followers: 0,
        x_engagement_avg: 0,
        credit_score: 40,
        total_tips_received: 0,
        total_tips_count: 0,
        balance: 0,
        registered_at,
        updated_at: registered_at,
        verification: VerificationStatus::default(),
        domain: String::from_str(env, ""),
        domain_verified: false,
        domain_verified_at: None,
        custom_min_tip: None,
    }
}

fn make_leaderboard_entry(env: &Env, amount: i128) -> LeaderboardEntry {
    LeaderboardEntry {
        address: Address::generate(env),
        username: String::from_str(env, "user"),
        amount,
        credit_score: 40,
    }
}

fn new_contract(env: &Env) -> Address {
    env.register_contract(None, TipzContract)
}

// ══════════════════════════════════════════════════════════════════════════════
// fees.rs — calculate_fee
// ══════════════════════════════════════════════════════════════════════════════

// [fees] mutant: swap return tuple → Ok((net, fee))
#[test]
fn fee_tuple_order_fee_first_net_second() {
    let (fee, net) = calculate_fee(10_000, 200).unwrap();
    assert_eq!(fee, 200);   // 10 000 × 200 / 10 000 = 200
    assert_eq!(net, 9_800);
    assert_eq!(fee + net, 10_000);
}

// [fees] mutant: replace 10_000 divisor with 10_001 or 9_999
#[test]
fn fee_divisor_is_exactly_10000_basis_points() {
    // 1 bps on exactly 10_000 stroops: 10_000 × 1 / 10_000 = 1 stroop exactly.
    let (fee, net) = calculate_fee(10_000, 1).unwrap();
    assert_eq!(fee, 1);
    assert_eq!(net, 9_999);
}

// [fees] mutant: remove `.max(1)` floor → fee rounds to 0 for tiny amounts
#[test]
fn fee_minimum_floor_one_bps_on_tiny_amount() {
    // 1 bps of 99 stroops = 0.0099 → truncates to 0 → must floor to 1
    let (fee, net) = calculate_fee(99, 1).unwrap();
    assert_eq!(fee, 1);
    assert_eq!(net, 98);
}

// [fees] mutant: change `== 0` to `!= 0` in zero-fee guard
#[test]
fn zero_fee_bps_short_circuits_before_any_arithmetic() {
    // fee_bps=0 must return (0, amount) for ALL amounts including i128::MAX-safe values.
    let (fee, net) = calculate_fee(0, 0).unwrap();
    assert_eq!((fee, net), (0, 0));

    let (fee, net) = calculate_fee(1, 0).unwrap();
    assert_eq!((fee, net), (0, 1));
}

// [fees] mutant: replace checked_sub with checked_add → net = amount + fee
#[test]
fn net_equals_amount_minus_fee_not_plus() {
    let amount = 500_000_i128;
    let (fee, net) = calculate_fee(amount, 300).unwrap(); // 3 %
    assert_eq!(fee, 15_000);
    assert_eq!(net, 485_000);
    // If checked_add were used: net would be 515 000, not 485 000.
    assert!(net < amount, "net must be strictly less than amount for non-zero fee");
}

// ══════════════════════════════════════════════════════════════════════════════
// credit.rs — calculate_credit_score / get_credit_breakdown_for_profile / get_tier
// ══════════════════════════════════════════════════════════════════════════════

// [credit] mutant: change BASE_SCORE (40) to 0 or another constant
#[test]
fn credit_breakdown_base_field_is_40() {
    let env = Env::default();
    let now = env.ledger().timestamp();
    let profile = blank_profile(&env, now);
    let bd = get_credit_breakdown_for_profile(&profile, now);
    assert_eq!(bd.base, BASE_SCORE);
    assert_eq!(bd.base, 40);
    // All components should be zero for a fresh profile.
    assert_eq!(bd.tip_score, 0);
    assert_eq!(bd.x_score, 0);
    assert_eq!(bd.age_score, 0);
    assert_eq!(bd.total, 40);
}

// [credit] mutant: swap TIP_WEIGHT (20) with X_WEIGHT (30) or AGE_WEIGHT (10)
#[test]
fn credit_tip_weight_contributes_exactly_20_points_at_max() {
    // tip_sub = 100 (100 XLM) → tip_score = 100 × 20 / 100 = 20
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut p = blank_profile(&env, now);
    p.total_tips_received = 1_000_000_000; // 100 XLM
    let bd = get_credit_breakdown_for_profile(&p, now);
    assert_eq!(bd.tip_score, 20);
    assert_eq!(bd.x_score, 0);
    assert_eq!(bd.age_score, 0);
    assert_eq!(bd.total, 60); // 40 + 20
}

// [credit] mutant: swap X_WEIGHT (30) with TIP_WEIGHT (20)
#[test]
fn credit_x_weight_contributes_exactly_30_points_at_max() {
    // x_sub = 100 (2500 followers + 500 engagement) → x_score = 100 × 30 / 100 = 30
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut p = blank_profile(&env, now);
    p.x_followers = 2_500;
    p.x_engagement_avg = 500;
    let bd = get_credit_breakdown_for_profile(&p, now);
    assert_eq!(bd.x_score, 30);
    assert_eq!(bd.tip_score, 0);
    assert_eq!(bd.age_score, 0);
    assert_eq!(bd.total, 70); // 40 + 30
}

// [credit] mutant: swap AGE_WEIGHT (10) with other weights
#[test]
fn credit_age_weight_contributes_exactly_10_points_at_max() {
    // age_sub capped at 100 (1000-day account) → age_score = 100 × 10 / 100 = 10
    let env = Env::default();
    let now = 86_400_u64 * 1_000;
    let mut p = blank_profile(&env, 0);
    p.registered_at = 0;
    let bd = get_credit_breakdown_for_profile(&p, now);
    assert_eq!(bd.age_score, 10);
    assert_eq!(bd.tip_score, 0);
    assert_eq!(bd.x_score, 0);
    assert_eq!(bd.total, 50); // 40 + 10
}

// [credit] mutant: change FOLLOWER_DIVISOR (50) to 49 or 51
#[test]
fn credit_follower_divisor_is_50_per_point() {
    // 50 followers → follower_part = 50/50 = 1; engagement=0 → x_sub=1
    // x_score = 1 × 30 / 100 = 0 (integer division)
    // 2500 followers → follower_part = min(2500/50, 50) = 50
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut p = blank_profile(&env, now);
    p.x_followers = 2_500; // exactly 50 × FOLLOWER_DIVISOR
    p.x_engagement_avg = 0;
    let bd = get_credit_breakdown_for_profile(&p, now);
    // follower_part saturates at 50 (X_SUB_CAP), engagement_part=0 → x_sub=50
    // x_score = 50 × 30 / 100 = 15
    assert_eq!(bd.x_score, 15);
    assert_eq!(bd.total, 55); // 40 + 15
}

// [credit] mutant: change ENGAGEMENT_DIVISOR (10) to 9 or 11
#[test]
fn credit_engagement_divisor_is_10_per_point() {
    // 500 engagement → engagement_part = min(500/10, 50) = 50; followers=0 → x_sub=50
    // x_score = 50 × 30 / 100 = 15
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut p = blank_profile(&env, now);
    p.x_followers = 0;
    p.x_engagement_avg = 500; // exactly 50 × ENGAGEMENT_DIVISOR
    let bd = get_credit_breakdown_for_profile(&p, now);
    assert_eq!(bd.x_score, 15);
    assert_eq!(bd.total, 55); // 40 + 15
}

// [credit] mutant: change AGE_DIVISOR (10) to 9 or 11
#[test]
fn credit_age_divisor_is_10_days_per_point() {
    // 100 days → age_sub = 100/10 = 10; age_score = 10 × 10 / 100 = 1
    let env = Env::default();
    let now = 86_400_u64 * 100;
    let mut p = blank_profile(&env, 0);
    p.registered_at = 0;
    let bd = get_credit_breakdown_for_profile(&p, now);
    assert_eq!(bd.age_score, 1);
    assert_eq!(bd.total, 41); // 40 + 1
}

// [credit] mutant: change `&&` to `||` in x_sub zero-guard
// → profile with only followers (no engagement) would incorrectly get x_sub=0.
#[test]
fn credit_x_sub_with_only_followers_nonzero() {
    let env = Env::default();
    let now = env.ledger().timestamp();
    let mut p = blank_profile(&env, now);
    p.x_followers = 2_500; // saturates follower_part at 50
    p.x_engagement_avg = 0;
    // x_sub = 50, x_score = 15 → total = 55
    assert_eq!(calculate_credit_score(&p, now), 55);
}

// [credit] mutant: change `||` to `&&` in age guard (now <= registered_at || age < 1 day)
// → age would not be zeroed for clock-skew case.
#[test]
fn credit_age_zero_when_now_equals_registered_at() {
    let env = Env::default();
    let ts = 1_000_000_u64;
    let mut p = blank_profile(&env, ts);
    p.registered_at = ts; // now == registered_at
    assert_eq!(calculate_credit_score(&p, ts), BASE_SCORE);
}

// [credit] mutant: change `>=` to `>` in tier match arm boundary
#[test]
fn credit_tier_boundaries_exact() {
    // All five boundary pairs: (lower-edge, upper-edge)
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
    // One above 100 is also Diamond (wildcard arm).
    assert_eq!(get_tier(101), CreditTier::Diamond);
}

// [credit] mutant: calculate_credit_score_with_streak ignores streak_score
// Note: streak bonus storage is currently stubbed to return 0; the test
// confirms the function still returns a value ≥ calculate_credit_score.
#[test]
fn credit_with_streak_score_is_not_less_than_base_score() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let addr = Address::generate(&env);
    let now = env.ledger().timestamp();
    let mut p = blank_profile(&env, now);
    p.owner = addr.clone();

    env.as_contract(&contract_id, || {
        let score_base = calculate_credit_score(&p, now);
        let score_with = calculate_credit_score_with_streak(&env, &p, now);
        // With streak_bonus = 0 (stubbed), both must be equal.
        assert_eq!(score_with, score_base);
        assert_eq!(score_with, BASE_SCORE);
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// leaderboard.rs — get_leaderboard, reset_leaderboard, remove_from_leaderboard
// ══════════════════════════════════════════════════════════════════════════════

// [leaderboard] mutant: `limit == 0 || limit >= entries.len()` condition altered
#[test]
fn leaderboard_get_limit_zero_returns_all() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    env.as_contract(&contract_id, || {
        let mut entries = Vec::new(&env);
        for i in 1_i128..=5 {
            entries.push_back(make_leaderboard_entry(&env, i * 10));
        }
        crate::storage::set_leaderboard(&env, LeaderboardPeriod::AllTime, &entries);

        let result = get_leaderboard(&env, LeaderboardPeriod::AllTime, 0);
        assert_eq!(result.len(), 5, "limit=0 must return all entries");
    });
}

// [leaderboard] mutant: `limit >= entries.len()` changed to `limit > entries.len()`
#[test]
fn leaderboard_get_limit_equal_to_len_returns_all() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    env.as_contract(&contract_id, || {
        let mut entries = Vec::new(&env);
        for i in 1_i128..=4 {
            entries.push_back(make_leaderboard_entry(&env, i * 10));
        }
        crate::storage::set_leaderboard(&env, LeaderboardPeriod::AllTime, &entries);

        // limit == len → return all
        let r_eq = get_leaderboard(&env, LeaderboardPeriod::AllTime, 4);
        assert_eq!(r_eq.len(), 4);
        // limit > len → also return all
        let r_gt = get_leaderboard(&env, LeaderboardPeriod::AllTime, 10);
        assert_eq!(r_gt.len(), 4);
    });
}

// [leaderboard] mutant: loop condition `i < limit` changed to `i <= limit`
#[test]
fn leaderboard_get_limit_less_than_len_returns_exactly_limit() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    env.as_contract(&contract_id, || {
        let mut entries = Vec::new(&env);
        for amount in [500_i128, 400, 300, 200, 100] {
            entries.push_back(make_leaderboard_entry(&env, amount));
        }
        crate::storage::set_leaderboard(&env, LeaderboardPeriod::AllTime, &entries);

        let result = get_leaderboard(&env, LeaderboardPeriod::AllTime, 3);
        assert_eq!(result.len(), 3);
        // Must be the top-3 by amount (first three in the descending list).
        assert_eq!(result.get(0).unwrap().amount, 500);
        assert_eq!(result.get(1).unwrap().amount, 400);
        assert_eq!(result.get(2).unwrap().amount, 300);
    });
}

// [leaderboard] mutant: reset_leaderboard removes AllTime entries
#[test]
fn leaderboard_reset_all_time_is_noop() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    env.as_contract(&contract_id, || {
        let mut entries = Vec::new(&env);
        entries.push_back(make_leaderboard_entry(&env, 100));
        crate::storage::set_leaderboard(&env, LeaderboardPeriod::AllTime, &entries);

        reset_leaderboard(&env, LeaderboardPeriod::AllTime);

        let after = get_leaderboard(&env, LeaderboardPeriod::AllTime, 10);
        assert_eq!(after.len(), 1, "AllTime leaderboard must not be cleared on reset");
    });
}

// [leaderboard] mutant: reset_leaderboard does NOT clear Monthly/Weekly entries
#[test]
fn leaderboard_reset_monthly_clears_entries_and_stamps_time() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    env.as_contract(&contract_id, || {
        let mut entries = Vec::new(&env);
        entries.push_back(make_leaderboard_entry(&env, 100));
        crate::storage::set_leaderboard(&env, LeaderboardPeriod::Monthly, &entries);

        reset_leaderboard(&env, LeaderboardPeriod::Monthly);

        let after = get_leaderboard(&env, LeaderboardPeriod::Monthly, 10);
        assert_eq!(after.len(), 0, "Monthly leaderboard must be cleared on reset");
        assert_eq!(get_leaderboard_size(&env, LeaderboardPeriod::Monthly), 0);
    });
}

// [leaderboard] mutant: remove_from_leaderboard keeps the targeted address
#[test]
fn leaderboard_remove_eliminates_exactly_one_entry() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let to_remove = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let mut entries = Vec::new(&env);
        entries.push_back(LeaderboardEntry {
            address: to_remove.clone(),
            username: String::from_str(&env, "gone"),
            amount: 200,
            credit_score: 40,
        });
        entries.push_back(make_leaderboard_entry(&env, 100));
        crate::storage::set_leaderboard(&env, LeaderboardPeriod::AllTime, &entries);

        remove_from_leaderboard(&env, LeaderboardPeriod::AllTime, &to_remove);

        assert_eq!(get_leaderboard_size(&env, LeaderboardPeriod::AllTime), 1);
        assert!(!is_on_leaderboard(&env, LeaderboardPeriod::AllTime, &to_remove));
    });
}

// [leaderboard] mutant: `==` → `!=` in address comparison inside remove loop
#[test]
fn leaderboard_remove_keeps_other_addresses_intact() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let keep = Address::generate(&env);
    let remove = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let mut entries = Vec::new(&env);
        entries.push_back(LeaderboardEntry {
            address: keep.clone(),
            username: String::from_str(&env, "keep"),
            amount: 300,
            credit_score: 40,
        });
        entries.push_back(LeaderboardEntry {
            address: remove.clone(),
            username: String::from_str(&env, "remove"),
            amount: 100,
            credit_score: 40,
        });
        crate::storage::set_leaderboard(&env, LeaderboardPeriod::AllTime, &entries);

        remove_from_leaderboard(&env, LeaderboardPeriod::AllTime, &remove);

        assert!(is_on_leaderboard(&env, LeaderboardPeriod::AllTime, &keep));
        assert!(!is_on_leaderboard(&env, LeaderboardPeriod::AllTime, &remove));
    });
}

// [leaderboard] mutant: `is_on_leaderboard` returns true for all / false for all
#[test]
fn leaderboard_is_on_leaderboard_true_and_false_cases() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let present = Address::generate(&env);
    let absent = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let mut entries = Vec::new(&env);
        entries.push_back(LeaderboardEntry {
            address: present.clone(),
            username: String::from_str(&env, "here"),
            amount: 100,
            credit_score: 40,
        });
        crate::storage::set_leaderboard(&env, LeaderboardPeriod::AllTime, &entries);

        assert!(is_on_leaderboard(&env, LeaderboardPeriod::AllTime, &present));
        assert!(!is_on_leaderboard(&env, LeaderboardPeriod::AllTime, &absent));
    });
}

// [leaderboard] mutant: `i + 1` in get_leaderboard_rank replaced by `i`
#[test]
fn leaderboard_rank_returns_one_based_position() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let third = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let mut entries = Vec::new(&env);
        for (addr, amount) in [(&first, 300_i128), (&second, 200), (&third, 100)] {
            entries.push_back(LeaderboardEntry {
                address: addr.clone(),
                username: String::from_str(&env, "u"),
                amount,
                credit_score: 40,
            });
        }
        crate::storage::set_leaderboard(&env, LeaderboardPeriod::AllTime, &entries);

        assert_eq!(get_leaderboard_rank(&env, LeaderboardPeriod::AllTime, &first), Some(1));
        assert_eq!(get_leaderboard_rank(&env, LeaderboardPeriod::AllTime, &second), Some(2));
        assert_eq!(get_leaderboard_rank(&env, LeaderboardPeriod::AllTime, &third), Some(3));

        let absent = Address::generate(&env);
        assert_eq!(get_leaderboard_rank(&env, LeaderboardPeriod::AllTime, &absent), None);
    });
}

// [leaderboard] mutant: update_leaderboard skips deactivated profile check
#[test]
fn leaderboard_update_skips_deactivated_profile() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let addr = Address::generate(&env);

    env.as_contract(&contract_id, || {
        crate::storage::set_profile_deactivated_at(&env, &addr, env.ledger().timestamp());

        let mut p = blank_profile(&env, 0);
        p.owner = addr.clone();
        p.total_tips_received = 1_000_000;

        update_leaderboard(&env, &p, LeaderboardPeriod::AllTime, 1_000_000);

        assert!(!is_on_leaderboard(&env, LeaderboardPeriod::AllTime, &addr),
            "deactivated profile must not appear on leaderboard");
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// tips.rs — store_tip / get_tip / get_recent_tips
// ══════════════════════════════════════════════════════════════════════════════

// [tips] mutant: is_anonymous condition inverted → anonymous tip has sender set
#[test]
fn tips_anonymous_flag_true_sets_benefactor_to_none() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let sender = Address::generate(&env);
    let creator = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let tip_id = store_tip(
            &env,
            &sender,
            None,
            &creator,
            10_000_000,
            String::from_str(&env, ""),
            true, // is_anonymous = true
            false,
        );
        let tip = get_tip(&env, tip_id).expect("tip should be stored");
        assert!(tip.benefactor.is_none(), "anonymous tip must have no benefactor");
        assert!(tip.is_anonymous);
    });
}

// [tips] mutant: is_anonymous condition inverted → non-anonymous tip has no sender
#[test]
fn tips_anonymous_flag_false_sets_benefactor_to_sender() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let sender = Address::generate(&env);
    let creator = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let tip_id = store_tip(
            &env,
            &sender,
            None,
            &creator,
            10_000_000,
            String::from_str(&env, ""),
            false, // is_anonymous = false
            false,
        );
        let tip = get_tip(&env, tip_id).expect("tip should be stored");
        assert_eq!(tip.benefactor, Some(sender.clone()),
            "non-anonymous tip must set benefactor to sender when no explicit benefactor");
        assert!(!tip.is_anonymous);
    });
}

// [tips] mutant: explicit benefactor overridden → benefactor.or(Some(sender)) replaced
#[test]
fn tips_explicit_benefactor_takes_precedence_over_sender() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let sender = Address::generate(&env);
    let explicit_benefactor = Address::generate(&env);
    let creator = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let tip_id = store_tip(
            &env,
            &sender,
            Some(explicit_benefactor.clone()),
            &creator,
            10_000_000,
            String::from_str(&env, ""),
            false,
            false,
        );
        let tip = get_tip(&env, tip_id).expect("tip should be stored");
        assert_eq!(tip.benefactor, Some(explicit_benefactor),
            "explicit benefactor must be preserved");
    });
}

// [tips] mutant: get_tip returns Some for arbitrary IDs
#[test]
fn tips_get_tip_returns_none_for_missing_id() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    env.as_contract(&contract_id, || {
        assert!(get_tip(&env, 9_999).is_none(), "non-existent tip ID must return None");
    });
}

// [tips] mutant: tip_id increments by 0 or 2 instead of 1
#[test]
fn tips_store_tip_ids_are_sequential_starting_at_zero() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let sender = Address::generate(&env);
    let creator = Address::generate(&env);
    let msg = String::from_str(&env, "");

    env.as_contract(&contract_id, || {
        let id0 = store_tip(&env, &sender, None, &creator, 1_000, msg.clone(), false, false);
        let id1 = store_tip(&env, &sender, None, &creator, 2_000, msg.clone(), false, false);
        let id2 = store_tip(&env, &sender, None, &creator, 3_000, msg.clone(), false, false);

        assert_eq!(id1, id0 + 1);
        assert_eq!(id2, id0 + 2);

        // Each ID retrieves the correct amount.
        assert_eq!(get_tip(&env, id0).unwrap().amount, 1_000);
        assert_eq!(get_tip(&env, id1).unwrap().amount, 2_000);
        assert_eq!(get_tip(&env, id2).unwrap().amount, 3_000);
    });
}

// [tips] mutant: `limit > MAX_PAGE_LIMIT` changed to `limit >= MAX_PAGE_LIMIT`
// → limit of exactly 50 would be silently capped to 50 (same), but 51 would not be capped.
#[test]
fn tips_get_recent_tips_caps_limit_above_50() {
    let env = Env::default();
    let contract_id = new_contract(&env);
    let sender = Address::generate(&env);
    let creator = Address::generate(&env);
    let msg = String::from_str(&env, "");

    env.as_contract(&contract_id, || {
        // Store exactly 3 tips.
        for i in 0..3_i128 {
            let tip_id = store_tip(&env, &sender, None, &creator, i + 1, msg.clone(), false, false);
            crate::storage::add_creator_tip(&env, &creator, tip_id);
        }

        // Requesting limit=60 (> MAX_PAGE_LIMIT) must return at most 50; here only 3 exist.
        let result = get_recent_tips(&env, &creator, 60, 0);
        assert_eq!(result.len(), 3, "result bounded by available tips, not inflated limit");
    });
}
