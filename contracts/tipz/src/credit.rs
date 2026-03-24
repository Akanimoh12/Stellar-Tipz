//! Credit score calculation for the Tipz contract.
//!
//! The credit score is a value in `0..=100` that reflects a creator's
//! on-chain and off-chain reputation. It is a weighted sum of six
//! sub-scores, each also in the `0..=100` range:
//!
//! | Component     | Weight |
//! |---------------|--------|
//! | Tip Volume    |   30 % |
//! | Tip Count     |   20 % |
//! | Consistency   |   15 % |
//! | X Followers   |   15 % |
//! | X Engagement  |   10 % |
//! | Account Age   |   10 % |
//!
//! All arithmetic is integer-only (no floating point) as required by the
//! Soroban runtime.  Replies are weighted 1.5× over posts using the integer
//! approximation `replies * 3 / 2`.
//!
//! Called by `send_tip` (issue #7), `withdraw_tips` (issue #10), and
//! `update_x_metrics` (issue #15) once those are implemented.
//!
//! See `docs/CREDIT_SCORE.md` for the full algorithm specification.

use crate::types::Profile;

/// Stroops per XLM (Stellar's smallest unit: 1 XLM = 10 000 000 stroops).
const STROOPS_PER_XLM: i128 = 10_000_000;

/// Seconds in an approximate calendar month (30 days).
const SECS_PER_MONTH: u64 = 30 * 24 * 3_600;

// ── Public API ────────────────────────────────────────────────────────────────

/// Calculate the credit score for `profile` at ledger time `now`.
///
/// `now` should be `env.ledger().timestamp()`. Passing `now == 0` is safe
/// but will treat every time-based sub-score as if no time has elapsed.
///
/// Returns a value in `0..=100`.
///
/// # Note
/// `#[allow(dead_code)]` is present because the call-sites in `send_tip`,
/// `withdraw_tips`, and `update_x_metrics` are not yet implemented.  Remove
/// the attribute when those issues are resolved.
#[allow(dead_code)]
pub(crate) fn calculate_credit_score(profile: &Profile, now: u64) -> u32 {
    let vol = tip_volume_score(profile.total_tips_received);
    let count = tip_count_score(profile.total_tips_count);
    let cons = consistency_score(profile.total_tips_count, profile.registered_at, now);
    let fol = follower_score(profile.x_followers);
    let eng = engagement_score(profile.x_posts, profile.x_replies);
    let age = account_age_score(profile.registered_at, now);

    // Weights sum to 100; divide by 100 to normalise back to 0-100.
    let weighted = vol * 30 + count * 20 + cons * 15 + fol * 15 + eng * 10 + age * 10;
    (weighted / 100).min(100)
}

// ── Sub-score helpers ─────────────────────────────────────────────────────────

/// Sub-score for lifetime tip volume received (0-100).
///
/// Uses stepped log₁₀ thresholds over whole-XLM amounts to avoid floating
/// point while still rewarding creators across many orders of magnitude.
fn tip_volume_score(total_tips_received: i128) -> u32 {
    if total_tips_received <= 0 {
        return 0;
    }
    let xlm = total_tips_received / STROOPS_PER_XLM;
    // Sub-1 XLM still earns a minimal score so micro-tips count.
    if xlm == 0 {
        return 5;
    }
    match xlm {
        1..=9 => 15,
        10..=99 => 30,
        100..=999 => 50,
        1_000..=9_999 => 70,
        10_000..=99_999 => 85,
        _ => 100,
    }
}

/// Sub-score for the total number of tips received (0-100).
fn tip_count_score(count: u32) -> u32 {
    match count {
        0 => 0,
        1..=4 => 10,
        5..=19 => 25,
        20..=49 => 45,
        50..=99 => 65,
        100..=499 => 85,
        _ => 100,
    }
}

/// Sub-score for tip consistency — average tips received per month (0-100).
///
/// Rewards creators who receive tips steadily over time rather than in a
/// single burst.  For accounts that have existed less than one full month,
/// one month is assumed to avoid inflating brand-new account rates.
fn consistency_score(tip_count: u32, registered_at: u64, now: u64) -> u32 {
    if tip_count == 0 {
        return 0;
    }
    let age_secs = now.saturating_sub(registered_at);
    let months = (age_secs / SECS_PER_MONTH).max(1);
    let tips_per_month = tip_count as u64 / months;
    match tips_per_month {
        0 => 5,
        1 => 20,
        2..=4 => 40,
        5..=9 => 60,
        10..=29 => 80,
        _ => 100,
    }
}

/// Sub-score for X (Twitter) follower count (0-100).
fn follower_score(followers: u32) -> u32 {
    match followers {
        0 => 0,
        1..=99 => 10,
        100..=499 => 25,
        500..=1_999 => 45,
        2_000..=9_999 => 65,
        10_000..=49_999 => 85,
        _ => 100,
    }
}

/// Sub-score for X engagement: posts + weighted replies (0-100).
///
/// Replies signal genuine two-way engagement, so they are weighted 1.5×
/// over posts.  Integer approximation: `replies * 3 / 2`.  Saturating
/// arithmetic prevents panics on extreme inputs.
fn engagement_score(posts: u32, replies: u32) -> u32 {
    let weighted = posts.saturating_add(replies.saturating_mul(3) / 2);
    match weighted {
        0 => 0,
        1..=49 => 10,
        50..=199 => 25,
        200..=499 => 45,
        500..=1_999 => 65,
        2_000..=4_999 => 85,
        _ => 100,
    }
}

/// Sub-score for account age (0-100).
///
/// Older accounts have a longer, verifiable track record on the platform.
fn account_age_score(registered_at: u64, now: u64) -> u32 {
    let age_secs = now.saturating_sub(registered_at);
    let months = age_secs / SECS_PER_MONTH;
    match months {
        0 => 5,
        1..=2 => 15,
        3..=5 => 30,
        6..=11 => 50,
        12..=23 => 70,
        24..=47 => 85,
        _ => 100,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Profile;
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    const MONTH: u64 = 30 * 24 * 3_600;
    const YEAR: u64 = 12 * MONTH;

    fn blank_profile(env: &Env) -> Profile {
        Profile {
            owner: Address::generate(env),
            username: String::from_str(env, "test"),
            display_name: String::from_str(env, "Test"),
            bio: String::from_str(env, ""),
            image_url: String::from_str(env, ""),
            x_handle: String::from_str(env, ""),
            x_followers: 0,
            x_posts: 0,
            x_replies: 0,
            credit_score: 0,
            total_tips_received: 0,
            total_tips_count: 0,
            balance: 0,
            registered_at: 0,
            updated_at: 0,
        }
    }

    // ── tip_volume_score ──────────────────────────────────────────────────

    #[test]
    fn volume_zero_and_negative_return_zero() {
        assert_eq!(tip_volume_score(0), 0);
        assert_eq!(tip_volume_score(-1), 0);
        assert_eq!(tip_volume_score(i128::MIN), 0);
    }

    #[test]
    fn volume_sub_one_xlm_returns_five() {
        assert_eq!(tip_volume_score(1), 5);
        assert_eq!(tip_volume_score(STROOPS_PER_XLM - 1), 5);
    }

    #[test]
    fn volume_stepped_thresholds() {
        assert_eq!(tip_volume_score(STROOPS_PER_XLM), 15); // 1 XLM
        assert_eq!(tip_volume_score(10 * STROOPS_PER_XLM), 30); // 10 XLM
        assert_eq!(tip_volume_score(100 * STROOPS_PER_XLM), 50); // 100 XLM
        assert_eq!(tip_volume_score(1_000 * STROOPS_PER_XLM), 70); // 1 000 XLM
        assert_eq!(tip_volume_score(10_000 * STROOPS_PER_XLM), 85); // 10 000 XLM
        assert_eq!(tip_volume_score(100_000 * STROOPS_PER_XLM), 100); // 100 000+ XLM
    }

    // ── tip_count_score ───────────────────────────────────────────────────

    #[test]
    fn count_zero_returns_zero() {
        assert_eq!(tip_count_score(0), 0);
    }

    #[test]
    fn count_boundaries() {
        assert_eq!(tip_count_score(1), 10);
        assert_eq!(tip_count_score(4), 10);
        assert_eq!(tip_count_score(5), 25);
        assert_eq!(tip_count_score(19), 25);
        assert_eq!(tip_count_score(20), 45);
        assert_eq!(tip_count_score(49), 45);
        assert_eq!(tip_count_score(50), 65);
        assert_eq!(tip_count_score(99), 65);
        assert_eq!(tip_count_score(100), 85);
        assert_eq!(tip_count_score(499), 85);
        assert_eq!(tip_count_score(500), 100);
        assert_eq!(tip_count_score(u32::MAX), 100);
    }

    // ── consistency_score ─────────────────────────────────────────────────

    #[test]
    fn consistency_no_tips_returns_zero() {
        assert_eq!(consistency_score(0, 0, YEAR), 0);
    }

    #[test]
    fn consistency_new_account_one_tip() {
        // Registered and tipped within first month → 1 tip/month → 20
        assert_eq!(consistency_score(1, 0, MONTH / 2), 20);
    }

    #[test]
    fn consistency_one_tip_over_two_years() {
        // 1 tip over 24 months → 0 tips/month (integer div) → 5
        assert_eq!(consistency_score(1, 0, 24 * MONTH), 5);
    }

    #[test]
    fn consistency_high_rate() {
        // 100 tips over 5 months → 20/month → 80
        assert_eq!(consistency_score(100, 0, 5 * MONTH), 80);
    }

    #[test]
    fn consistency_very_high_rate() {
        // 600 tips over 6 months → 100/month → 100
        assert_eq!(consistency_score(600, 0, 6 * MONTH), 100);
    }

    // ── follower_score ────────────────────────────────────────────────────

    #[test]
    fn follower_zero_returns_zero() {
        assert_eq!(follower_score(0), 0);
    }

    #[test]
    fn follower_boundaries() {
        assert_eq!(follower_score(1), 10);
        assert_eq!(follower_score(99), 10);
        assert_eq!(follower_score(100), 25);
        assert_eq!(follower_score(499), 25);
        assert_eq!(follower_score(500), 45);
        assert_eq!(follower_score(1_999), 45);
        assert_eq!(follower_score(2_000), 65);
        assert_eq!(follower_score(9_999), 65);
        assert_eq!(follower_score(10_000), 85);
        assert_eq!(follower_score(49_999), 85);
        assert_eq!(follower_score(50_000), 100);
        assert_eq!(follower_score(u32::MAX), 100);
    }

    // ── engagement_score ──────────────────────────────────────────────────

    #[test]
    fn engagement_zero_returns_zero() {
        assert_eq!(engagement_score(0, 0), 0);
    }

    #[test]
    fn engagement_replies_outweigh_equal_posts() {
        // Replies weighted 1.5×, so 10 replies > 10 posts in contribution.
        assert!(engagement_score(0, 10) >= engagement_score(10, 0));
    }

    #[test]
    fn engagement_boundaries() {
        assert_eq!(engagement_score(1, 0), 10);
        assert_eq!(engagement_score(50, 0), 25);
        assert_eq!(engagement_score(200, 0), 45);
        assert_eq!(engagement_score(500, 0), 65);
        assert_eq!(engagement_score(2_000, 0), 85);
        assert_eq!(engagement_score(5_000, 0), 100);
    }

    #[test]
    fn engagement_saturating_on_extreme_inputs() {
        // Must not panic.
        let score = engagement_score(u32::MAX, u32::MAX);
        assert_eq!(score, 100);
    }

    // ── account_age_score ─────────────────────────────────────────────────

    #[test]
    fn age_same_timestamp_returns_five() {
        assert_eq!(account_age_score(0, 0), 5);
        assert_eq!(account_age_score(1_000, 1_000), 5);
    }

    #[test]
    fn age_now_before_registered_does_not_panic() {
        // Saturating sub: age = 0 → months = 0 → 5
        assert_eq!(account_age_score(1_000_000, 0), 5);
    }

    #[test]
    fn age_boundaries() {
        assert_eq!(account_age_score(0, MONTH), 15);
        assert_eq!(account_age_score(0, 3 * MONTH), 30);
        assert_eq!(account_age_score(0, 6 * MONTH), 50);
        assert_eq!(account_age_score(0, 12 * MONTH), 70);
        assert_eq!(account_age_score(0, 24 * MONTH), 85);
        assert_eq!(account_age_score(0, 48 * MONTH), 100);
        assert_eq!(account_age_score(0, 100 * YEAR), 100);
    }

    // ── calculate_credit_score (integration) ─────────────────────────────

    #[test]
    fn brand_new_creator_has_minimal_score() {
        let env = Env::default();
        // No activity, no followers, just registered.
        let profile = blank_profile(&env);
        let score = calculate_credit_score(&profile, 0);
        // Only account_age contributes: 5 * 10 / 100 = 0 (integer div)
        assert_eq!(score, 0);
    }

    #[test]
    fn age_only_score_after_six_months() {
        let env = Env::default();
        let profile = blank_profile(&env);
        // age sub-score = 50, weighted = 50*10 = 500, /100 = 5
        let score = calculate_credit_score(&profile, 6 * MONTH);
        assert_eq!(score, 5);
    }

    #[test]
    fn established_creator_scores_above_40() {
        let env = Env::default();
        let mut profile = blank_profile(&env);
        profile.x_followers = 5_000;
        profile.x_posts = 500;
        profile.x_replies = 200;
        profile.total_tips_received = 100 * STROOPS_PER_XLM;
        profile.total_tips_count = 80;
        let now = 18 * MONTH;
        let score = calculate_credit_score(&profile, now);
        assert!(score > 40, "expected mid-range score, got {score}");
        assert!(score <= 100);
    }

    #[test]
    fn max_score_is_clamped_to_100() {
        let env = Env::default();
        let mut profile = blank_profile(&env);
        profile.x_followers = 1_000_000;
        profile.x_posts = 100_000;
        profile.x_replies = 100_000;
        profile.total_tips_received = 1_000_000 * STROOPS_PER_XLM;
        profile.total_tips_count = 10_000;
        let score = calculate_credit_score(&profile, 10 * YEAR);
        assert_eq!(score, 100);
    }

    #[test]
    fn weighted_formula_is_correct() {
        // With all sub-scores at 100, weighted = 100*(30+20+15+15+10+10)/100 = 100
        let env = Env::default();
        let mut profile = blank_profile(&env);
        profile.x_followers = 1_000_000;
        profile.x_posts = 100_000;
        profile.x_replies = 100_000;
        profile.total_tips_received = 1_000_000 * STROOPS_PER_XLM;
        profile.total_tips_count = 10_000;
        assert_eq!(calculate_credit_score(&profile, 10 * YEAR), 100);
    }

    #[test]
    fn score_without_x_metrics_uses_onchain_data() {
        // No X data, but heavy on-chain activity should still give a decent score.
        let env = Env::default();
        let mut profile = blank_profile(&env);
        profile.total_tips_received = 1_000 * STROOPS_PER_XLM; // vol=70
        profile.total_tips_count = 200; // count=85
                                        // consistency: 200 tips / 12 months = 16/month → 80
        let now = YEAR;
        let score = calculate_credit_score(&profile, now);
        // vol*30 + count*20 + cons*15 + fol*0 + eng*0 + age*10
        // = 70*30 + 85*20 + 80*15 + 0 + 0 + 70*10
        // = 2100 + 1700 + 1200 + 0 + 0 + 700 = 5700 → /100 = 57
        assert_eq!(score, 57);
    }
}
