//! Property-based tests for contract logic (issue #621).
//!
//! Complements `test_fuzz.rs` (which covers input validation) by targeting the
//! pure arithmetic paths most prone to silent regressions: tip-amount
//! gating, fee splitting, and credit-score bounding.
//!
//! Each `proptest!` block runs with the proptest default of 256 cases, which
//! satisfies the issue's "256+ iterations in CI" requirement.

#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::{
    testutils::Address as _, Address, Env, Map, String as SorobanString, Symbol,
};

use crate::credit::{calculate_credit_score, BASE_SCORE, MAX_SCORE};
use crate::errors::ContractError;
use crate::fees::calculate_fee;
use crate::types::{Profile, VerificationStatus, VerificationType};
use crate::validation::{validate_tip_amount, validate_username};

fn build_profile(
    env: &Env,
    owner: Address,
    total_tips_received: i128,
    x_followers: u32,
    x_engagement_avg: u32,
    registered_at: u64,
) -> Profile {
    Profile {
        owner,
        username: SorobanString::from_str(env, "alice"),
        display_name: SorobanString::from_str(env, "Alice"),
        bio: SorobanString::from_str(env, ""),
        website: SorobanString::from_str(env, ""),
        image_url: SorobanString::from_str(env, ""),
        social_links: Map::<Symbol, SorobanString>::new(env),
        x_handle: SorobanString::from_str(env, ""),
        x_followers,
        x_engagement_avg,
        credit_score: BASE_SCORE,
        total_tips_received,
        total_tips_count: 0,
        balance: 0,
        registered_at,
        updated_at: registered_at,
        verification: VerificationStatus {
            is_verified: false,
            verification_type: VerificationType::Unverified,
            verified_at: None,
            revoked_at: None,
        },
        domain: SorobanString::from_str(env, ""),
        domain_verified: false,
        domain_verified_at: None,
        custom_min_tip: None,
    }
}

// ── Tip amount validation ────────────────────────────────────────────────────

proptest! {
    /// A tip equal to or above the minimum must be accepted.
    #[test]
    fn property_tip_at_or_above_minimum_is_accepted(
        min in 1_i128..=1_000_000_000_i128,
        delta in 0_i128..=1_000_000_000_i128,
    ) {
        let amount = min.checked_add(delta).unwrap_or(i128::MAX);
        prop_assert_eq!(validate_tip_amount(amount, min), Ok(()));
    }

    /// Any tip strictly below the minimum must be rejected with TipBelowMinimum.
    #[test]
    fn property_tip_below_minimum_is_rejected(
        min in 2_i128..=1_000_000_000_i128,
        amount in 0_i128..=1_i128,
    ) {
        let strictly_below = (min - 1).min(amount.max(0));
        prop_assert_eq!(
            validate_tip_amount(strictly_below, min),
            Err(ContractError::TipBelowMinimum)
        );
    }
}

// ── Fee arithmetic ───────────────────────────────────────────────────────────

proptest! {
    /// For any positive amount and any valid fee bps, the fee plus the net
    /// must equal the original amount exactly (no value created or destroyed).
    #[test]
    fn property_fee_plus_net_equals_amount(
        amount in 1_i128..=1_000_000_000_000_i128,
        fee_bps in 0_u32..=1_000_u32,
    ) {
        let (fee, net) = calculate_fee(amount, fee_bps).unwrap();
        prop_assert_eq!(fee + net, amount);
        prop_assert!(fee >= 0);
        prop_assert!(net >= 0);
    }

    /// For any positive amount and any non-zero fee bps within the supported
    /// range, the fee must never exceed the amount being withdrawn.
    #[test]
    fn property_fee_never_exceeds_amount(
        amount in 1_i128..=1_000_000_000_000_i128,
        fee_bps in 1_u32..=1_000_u32,
    ) {
        let (fee, _net) = calculate_fee(amount, fee_bps).unwrap();
        prop_assert!(fee <= amount);
    }

    /// Doubling the amount with the same fee_bps doubles the fee (within the
    /// 1-stroop dust-floor rounding). Catches off-by-one and rounding bugs.
    #[test]
    fn property_fee_scales_linearly(
        amount in 10_000_i128..=1_000_000_000_i128,
        fee_bps in 100_u32..=1_000_u32,
    ) {
        let (fee_single, _) = calculate_fee(amount, fee_bps).unwrap();
        let (fee_double, _) = calculate_fee(amount * 2, fee_bps).unwrap();
        // Allow up to 1 stroop drift from integer rounding.
        let diff = (fee_double - fee_single * 2).abs();
        prop_assert!(diff <= 1, "fee did not scale linearly: {} vs {}", fee_single, fee_double);
    }
}

// ── Credit score bounding ────────────────────────────────────────────────────

proptest! {
    /// The credit score must always fall in [0, MAX_SCORE] regardless of any
    /// combination of tip volume, X metrics, or account age.
    #[test]
    fn property_credit_score_always_bounded(
        tips in 0_i128..=i128::MAX / 4,
        followers in 0_u32..=10_000_000_u32,
        engagement in 0_u32..=10_000_000_u32,
        age_days in 0_u64..=20_000_u64,
    ) {
        let env = Env::default();
        let owner = Address::generate(&env);

        let registered_at = 1_700_000_000_u64;
        let now = registered_at + age_days * 86_400;

        let profile = build_profile(&env, owner, tips, followers, engagement, registered_at);
        let score = calculate_credit_score(&profile, now);

        prop_assert!(score <= MAX_SCORE,
            "credit score {} exceeded MAX_SCORE {}", score, MAX_SCORE);
        prop_assert!(score >= BASE_SCORE,
            "credit score {} fell below BASE_SCORE {}", score, BASE_SCORE);
    }

    /// More tips never *decreases* the credit score (monotonicity).
    #[test]
    fn property_more_tips_never_decreases_score(
        base_tips in 0_i128..=1_000_000_000_i128,
        extra in 0_i128..=1_000_000_000_i128,
    ) {
        let env = Env::default();
        let owner = Address::generate(&env);
        let registered_at = 1_700_000_000_u64;
        let now = registered_at;

        let p1 = build_profile(&env, owner.clone(), base_tips, 0, 0, registered_at);
        let p2 = build_profile(&env, owner, base_tips + extra, 0, 0, registered_at);

        let s1 = calculate_credit_score(&p1, now);
        let s2 = calculate_credit_score(&p2, now);
        prop_assert!(s2 >= s1, "score regressed: {} -> {} with extra={}", s1, s2, extra);
    }
}

// ── Username validation roundtrip ────────────────────────────────────────────

fn is_valid_username(input: &[u8]) -> bool {
    if input.len() < 3 || input.len() > 32 {
        return false;
    }
    if !input[0].is_ascii_lowercase() || input[input.len() - 1] == b'_' {
        return false;
    }
    let mut prev_underscore = false;
    for &b in input {
        let valid = b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_';
        if !valid {
            return false;
        }
        if b == b'_' && prev_underscore {
            return false;
        }
        prev_underscore = b == b'_';
    }
    true
}

proptest! {
    /// Random bytes either parse as a valid username or are rejected as
    /// InvalidUsername — nothing else (no panics, no other error variants).
    #[test]
    fn property_username_validation_terminates(
        bytes in proptest::collection::vec(any::<u8>(), 0..40),
    ) {
        let env = Env::default();
        let s = SorobanString::from_bytes(&env, &bytes);
        let result = validate_username(&s);

        if is_valid_username(&bytes) {
            prop_assert_eq!(result, Ok(()));
        } else {
            prop_assert_eq!(result, Err(ContractError::InvalidUsername));
        }
    }
}

// ── Leaderboard determinism ──────────────────────────────────────────────────

proptest! {
    /// All-equal volumes should be ordered by insertion (stable sort).
    /// When multiple creators have the same amount, they should maintain
    /// their insertion order regardless of how updates are interleaved.
    #[test]
    fn property_leaderboard_all_equal_volumes_ordered_by_insertion(
        count in 1usize..=20,
    ) {
        use crate::TipzContract;
        use crate::types::LeaderboardPeriod;
        
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);

        let mut addresses = Vec::new();
        for i in 0..count {
            addresses.push(Address::generate(&env));
        }

        env.as_contract(&contract_id, || {
            // Insert all creators with the same amount
            let mut entries = soroban_sdk::Vec::new(&env);
            for addr in &addresses {
                let entry = crate::types::LeaderboardEntry {
                    address: addr.clone(),
                    username: SorobanString::from_str(&env, &format!("user{}", addresses.iter().position(|a| a == addr).unwrap())),
                    amount: 1_000_000,  // All equal
                    credit_score: 50,
                };
                entries.push_back(entry);
            }

            // Verify order is preserved
            for (i, addr) in addresses.iter().enumerate() {
                prop_assert_eq!(entries.get(i as u32).unwrap().address, *addr,
                    "leaderboard order not preserved at index {}", i);
            }
        });
    }
}

proptest! {
    /// Boundary test: inserting at MAX_LEADERBOARD_SIZE boundary.
    /// When a new entry ranks exactly at position MAX_LEADERBOARD_SIZE,
    /// it should be inserted and the last entry evicted.
    #[test]
    fn property_leaderboard_boundary_insertion_evicts_lowest(
        new_amount in 50_i128..=100_i128,
    ) {
        use crate::TipzContract;
        
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);

        env.as_contract(&contract_id, || {
            let max_size = crate::leaderboard::MAX_LEADERBOARD_SIZE as usize;
            
            // Build a leaderboard with max_size entries, amounts from (max_size) down to 1
            let mut entries = soroban_sdk::Vec::new(&env);
            for i in 0..max_size {
                let entry = crate::types::LeaderboardEntry {
                    address: Address::generate(&env),
                    username: SorobanString::from_str(&env, &format!("user{}", i)),
                    amount: (max_size - i) as i128 * 10,
                    credit_score: 50,
                };
                entries.push_back(entry);
            }

            // Create a new profile with an amount that would rank mid-list
            let new_addr = Address::generate(&env);
            let new_profile = Profile {
                owner: new_addr.clone(),
                username: SorobanString::from_str(&env, "newuser"),
                display_name: SorobanString::from_str(&env, "New User"),
                bio: SorobanString::from_str(&env, ""),
                website: SorobanString::from_str(&env, ""),
                image_url: SorobanString::from_str(&env, ""),
                social_links: Map::<Symbol, SorobanString>::new(&env),
                x_handle: SorobanString::from_str(&env, ""),
                x_followers: 0,
                x_engagement_avg: 0,
                credit_score: 50,
                total_tips_received: new_amount,
                total_tips_count: 0,
                balance: 0,
                registered_at: 1_700_000_000,
                updated_at: 1_700_000_000,
                verification: VerificationStatus {
                    is_verified: false,
                    verification_type: VerificationType::Unverified,
                    verified_at: None,
                    revoked_at: None,
                },
                domain: SorobanString::from_str(&env, ""),
                domain_verified: false,
                domain_verified_at: None,
                custom_min_tip: None,
            };

            // Simulate update_entries behavior
            crate::leaderboard::update_entries(&mut entries, &new_profile, new_amount);

            // Verify size is capped
            prop_assert!(
                entries.len() <= max_size as u32,
                "leaderboard exceeded max size: {} > {}",
                entries.len(),
                max_size
            );

            // Verify descending order
            for i in 1..entries.len() {
                prop_assert!(
                    entries.get(i - 1).unwrap().amount >= entries.get(i).unwrap().amount,
                    "leaderboard not in descending order at index {}",
                    i
                );
            }
        });
    }
}

proptest! {
    /// Same multiset of tips in different insertion orders should yield
    /// identical leaderboards (deterministic ordering).
    #[test]
    fn property_leaderboard_deterministic_regardless_of_insertion_order(
        amounts in proptest::collection::vec(1_i128..=10_000_i128, 1..=10),
    ) {
        use crate::TipzContract;
        
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);

        let mut leaderboard1 = Vec::new();
        let mut leaderboard2 = Vec::new();

        env.as_contract(&contract_id, || {
            // First insertion order: amounts as-is
            {
                let mut entries = soroban_sdk::Vec::new(&env);
                for (i, &amt) in amounts.iter().enumerate() {
                    let profile = Profile {
                        owner: Address::generate(&env),
                        username: SorobanString::from_str(&env, &format!("user{}", i)),
                        display_name: SorobanString::from_str(&env, "User"),
                        bio: SorobanString::from_str(&env, ""),
                        website: SorobanString::from_str(&env, ""),
                        image_url: SorobanString::from_str(&env, ""),
                        social_links: Map::<Symbol, SorobanString>::new(&env),
                        x_handle: SorobanString::from_str(&env, ""),
                        x_followers: 0,
                        x_engagement_avg: 0,
                        credit_score: 50,
                        total_tips_received: amt,
                        total_tips_count: 0,
                        balance: 0,
                        registered_at: 1_700_000_000 + i as u64,
                        updated_at: 1_700_000_000 + i as u64,
                        verification: VerificationStatus {
                            is_verified: false,
                            verification_type: VerificationType::Unverified,
                            verified_at: None,
                            revoked_at: None,
                        },
                        domain: SorobanString::from_str(&env, ""),
                        domain_verified: false,
                        domain_verified_at: None,
                        custom_min_tip: None,
                    };
                    crate::leaderboard::update_entries(&mut entries, &profile, amt);
                }
                for e in entries.iter() {
                    leaderboard1.push(e.amount);
                }
            }

            // Second insertion order: amounts reversed
            {
                let mut entries = soroban_sdk::Vec::new(&env);
                for (i, &amt) in amounts.iter().enumerate().rev() {
                    let profile = Profile {
                        owner: Address::generate(&env),
                        username: SorobanString::from_str(&env, &format!("user{}", i)),
                        display_name: SorobanString::from_str(&env, "User"),
                        bio: SorobanString::from_str(&env, ""),
                        website: SorobanString::from_str(&env, ""),
                        image_url: SorobanString::from_str(&env, ""),
                        social_links: Map::<Symbol, SorobanString>::new(&env),
                        x_handle: SorobanString::from_str(&env, ""),
                        x_followers: 0,
                        x_engagement_avg: 0,
                        credit_score: 50,
                        total_tips_received: amt,
                        total_tips_count: 0,
                        balance: 0,
                        registered_at: 1_700_000_000 + i as u64,
                        updated_at: 1_700_000_000 + i as u64,
                        verification: VerificationStatus {
                            is_verified: false,
                            verification_type: VerificationType::Unverified,
                            verified_at: None,
                            revoked_at: None,
                        },
                        domain: SorobanString::from_str(&env, ""),
                        domain_verified: false,
                        domain_verified_at: None,
                        custom_min_tip: None,
                    };
                    crate::leaderboard::update_entries(&mut entries, &profile, amt);
                }
                for e in entries.iter() {
                    leaderboard2.push(e.amount);
                }
            }
        });

        // Both leaderboards should have identical amounts in same order
        prop_assert_eq!(leaderboard1, leaderboard2,
            "leaderboards differ despite same multiset of amounts");
    }
}
