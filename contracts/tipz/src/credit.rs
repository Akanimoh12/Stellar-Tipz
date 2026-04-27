//! Credit score calculation and tier classification for the Tipz contract.
//!
//! ## Score range
//! All scores are in the range **0 – 100**.  Newly registered profiles start
//! at the base score of **40** (bottom of the Silver tier) because they
//! haven't yet built up tips, X presence, or account age.
//!
//! ## Formula
//! ```text
//! score = BASE_SCORE
//!       + tip_sub  * 20 / 100   (0-20 pts — tip volume component)
//!       + x_sub    * 30 / 100   (0-30 pts — X metrics component)
//!       + age_sub  * 10 / 100   (0-10 pts — account age component)
//!
//! capped at 100
//! ```
//!
//! Each *sub-score* is independently capped at 100 before weighting:
//!
//! | Sub-score  | Formula                                            | Cap |
//! |------------|----------------------------------------------------|-----|
//! | `tip_sub`  | `total_tips_received (stroops) / 10_000_000`       | 100 |
//! | `x_sub`    | `min(followers/50, 50) + min((posts+replies×1.5)/10, 50)` | 100 |
//! | `age_sub`  | `age_in_days / 10`  (0 when age < 1 day)          | 100 |
//!
//! ## Tier boundaries
//! | Tier    | Range   |
//! |---------|---------|
//! | New     | 0 – 19  |
//! | Bronze  | 20 – 39 |
//! | Silver  | 40 – 59 |
//! | Gold    | 60 – 79 |
//! | Diamond | 80 – 100|

use soroban_sdk::{Address, Env};

use crate::errors::ContractError;
use crate::storage;
use crate::types::{CreditBreakdown, CreditTier, Profile};

/// Base score awarded to every registered profile.
/// Places new creators in the Silver tier (40–59) by default.
pub const BASE_SCORE: u32 = 40;

/// Maximum possible credit score.
pub const MAX_SCORE: u32 = 100;

/// Weight (percent) applied to the tip sub-score.
pub const TIP_WEIGHT: u32 = 20;

/// Weight (percent) applied to the X metrics sub-score.
pub const X_WEIGHT: u32 = 30;

/// Weight (percent) applied to the account age sub-score.
pub const AGE_WEIGHT: u32 = 10;

/// Divisor used to transform stroop tip volume into a 0-100 sub-score.
pub const TIP_DIVISOR: i128 = 10_000_000;

/// Divisor used to map followers into the follower contribution.
pub const FOLLOWER_DIVISOR: u32 = 50;

/// Divisor used to map engagement average into the engagement contribution.
pub const ENGAGEMENT_DIVISOR: u32 = 10;

/// Divisor used to map account age in days into a 0-100 age sub-score.
pub const AGE_DIVISOR: u32 = 10;

/// Hard cap for normalized tip sub-score.
pub const TIP_CAP: u32 = 100;

/// Hard cap applied to each X sub-component (followers and engagement).
pub const X_SUB_CAP: u32 = 50;

/// Hard cap for normalized age sub-score.
pub const AGE_CAP: u32 = 100;

/// Bonus score awarded for each 7-tip streak milestone.
pub const STREAK_BONUS_SCORE: u32 = 1;

/// Tip volume (in stroops) that yields the maximum tip sub-score.
const TIP_VOLUME_CAP: i128 = (TIP_CAP as i128) * TIP_DIVISOR;

/// Seconds in one day - the minimum account age for the age component to
/// contribute anything to the score.
const SECONDS_PER_DAY: u64 = 86_400;

/// Build the weighted credit component breakdown for `profile` at `now`.
pub fn get_credit_breakdown_for_profile(profile: &Profile, now: u64) -> CreditBreakdown {
    let tip_sub: u32 = (profile.total_tips_received.clamp(0, TIP_VOLUME_CAP) / TIP_DIVISOR) as u32;

    let x_sub: u32 = if profile.x_followers == 0 && profile.x_engagement_avg == 0 {
        0
    } else {
        let follower_part = (profile.x_followers / FOLLOWER_DIVISOR).min(X_SUB_CAP);
        let engagement_part = (profile.x_engagement_avg / ENGAGEMENT_DIVISOR).min(X_SUB_CAP);

        follower_part + engagement_part
    };

    let age_sub: u32 =
        if now <= profile.registered_at || now - profile.registered_at < SECONDS_PER_DAY {
            0
        } else {
            let age_days = (now - profile.registered_at) / SECONDS_PER_DAY;
            (age_days as u32 / AGE_DIVISOR).min(AGE_CAP)
        };

    let tip_score = tip_sub * TIP_WEIGHT / MAX_SCORE;
    let x_score = x_sub * X_WEIGHT / MAX_SCORE;
    let age_score = age_sub * AGE_WEIGHT / MAX_SCORE;
    let total = (BASE_SCORE + tip_score + x_score + age_score).min(MAX_SCORE);

    CreditBreakdown {
        base: BASE_SCORE,
        tip_score,
        x_score,
        age_score,
        streak_score: 0,
        total,
    }
}

/// Build the weighted credit breakdown for `profile` including streak bonus.
pub fn get_credit_breakdown_with_streak(
    env: &Env,
    profile: &Profile,
    now: u64,
) -> CreditBreakdown {
    let mut breakdown = get_credit_breakdown_for_profile(profile, now);
    let streak_score = storage::get_creator_streak_bonus(env, &profile.owner).min(MAX_SCORE);
    breakdown.streak_score = streak_score;
    breakdown.total = (breakdown.total + streak_score).min(MAX_SCORE);
    breakdown
}

/// Compute the credit score (0–100) for `profile` at the given `now` timestamp
/// (seconds since the Unix epoch, obtained from `env.ledger().timestamp()`).
///
/// # Edge-case behaviour
/// | Condition                                | Result                         |
/// |------------------------------------------|--------------------------------|
/// | `total_tips_received` == 0               | tip component = 0 → score = 40|
/// | `total_tips_received` in the billions    | tip sub-score capped at 100    |
/// | all X metric fields are 0                | X component = 0                |
/// | account age < 1 day                      | age component = 0              |
pub fn calculate_credit_score(profile: &Profile, now: u64) -> u32 {
    get_credit_breakdown_for_profile(profile, now).total
}

/// Compute the credit score including streak bonuses.
pub fn calculate_credit_score_with_streak(env: &Env, profile: &Profile, now: u64) -> u32 {
    get_credit_breakdown_with_streak(env, profile, now).total
}

/// Map a credit score (0–100) to its [`CreditTier`].
///
/// Scores above 100 are treated as Diamond (the highest tier).
pub fn get_tier(score: u32) -> CreditTier {
    match score {
        0..=19 => CreditTier::New,
        20..=39 => CreditTier::Bronze,
        40..=59 => CreditTier::Silver,
        60..=79 => CreditTier::Gold,
        _ => CreditTier::Diamond, // 80–100 (and any value above 100)
    }
}

/// Load the profile for `address` from on-chain storage, compute its current
/// credit score, and return `(score, tier)`.
///
/// # Errors
/// Returns [`ContractError::NotRegistered`] when no profile exists for the
/// given address.
pub fn get_credit_tier(env: &Env, address: &Address) -> Result<(u32, CreditTier), ContractError> {
    if !storage::has_profile(env, address) {
        return Err(ContractError::NotRegistered);
    }

    let profile: Profile = storage::get_profile(env, address);

    let now = env.ledger().timestamp();
    let score = calculate_credit_score_with_streak(env, &profile, now);
    let tier = get_tier(score);

    Ok((score, tier))
}

/// Load the profile for `address` and return the score component breakdown.
pub fn get_credit_breakdown(
    env: &Env,
    address: &Address,
) -> Result<CreditBreakdown, ContractError> {
    if !storage::has_profile(env, address) {
        return Err(ContractError::NotRegistered);
    }

    let profile: Profile = storage::get_profile(env, address);
    let now = env.ledger().timestamp();
    Ok(get_credit_breakdown_with_streak(env, &profile, now))
}
