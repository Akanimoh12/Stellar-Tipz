//! Credit score validation against shared test vectors (issue #XXX).
//!
//! This test suite ensures the Rust contract implementation matches the shared
//! credit_score_vectors.json file, which is also used by the TypeScript backend
//! in CI. Any divergence between implementations is caught as a test failure.

#![cfg(test)]

use serde::{Deserialize, Serialize};
use soroban_sdk::{testutils::Address as _, Address, Env, Map, String, Symbol};
use std::fs;

use crate::types::{Profile, VerificationStatus, VerificationType};
use crate::TipzContract;
use crate::TipzContractClient;

// ── Vector file structures ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CreditScoreTestVector {
    id: String,
    description: String,
    inputs: CreditScoreInputs,
    expected_score: u32,
    tier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CreditScoreInputs {
    total_tips_received_stroops: i128,
    x_followers: u32,
    x_engagement_avg: u32,
    account_age_seconds: u64,
    streak_bonus: u32,
}

#[derive(Debug, Deserialize)]
struct VectorFile {
    version: String,
    description: String,
    algorithm: String,
    vectors: Vec<CreditScoreTestVector>,
}

// ── Helper to load and parse vectors ──────────────────────────────────────

fn load_test_vectors() -> VectorFile {
    // Try multiple paths for portability (Windows, Linux, CI environments)
    let possible_paths = vec![
        "contracts/tipz/tests/credit_score_vectors.json",
        "../contracts/tipz/tests/credit_score_vectors.json",
        "../../contracts/tipz/tests/credit_score_vectors.json",
        "tipz/tests/credit_score_vectors.json",
        "./tests/credit_score_vectors.json",
    ];

    for path in possible_paths {
        if let Ok(json_content) = fs::read_to_string(path) {
            if let Ok(vectors) = serde_json::from_str(&json_content) {
                return vectors;
            }
        }
    }

    panic!(
        "Failed to load credit_score_vectors.json. Tried paths: {:?}",
        possible_paths
    );
}

/// Helper: create a profile with given inputs for scoring
fn create_test_profile(env: &Env, inputs: &CreditScoreInputs, now: u64) -> Profile {
    let registered_at = now.saturating_sub(inputs.account_age_seconds);
    Profile {
        owner: Address::generate(env),
        username: String::from_str(env, "testuser"),
        display_name: String::from_str(env, "Test User"),
        bio: String::from_str(env, ""),
        website: String::from_str(env, ""),
        image_url: String::from_str(env, ""),
        social_links: Map::<Symbol, String>::new(env),
        x_handle: String::from_str(env, ""),
        x_followers: inputs.x_followers,
        x_engagement_avg: inputs.x_engagement_avg,
        credit_score: 0,
        total_tips_received: inputs.total_tips_received_stroops,
        total_tips_count: if inputs.total_tips_received_stroops > 0 { 1 } else { 0 },
        balance: inputs.total_tips_received_stroops,
        registered_at,
        updated_at: now,
        verification: VerificationStatus {
            is_verified: false,
            verification_type: VerificationType::Unverified,
            verified_at: None,
            revoked_at: None,
        },
        domain: String::from_str(env, ""),
        domain_verified: false,
        domain_verified_at: None,
        custom_min_tip: None,
    }
}

/// Helper: get the credit tier name from score (must match tiers in JSON)
fn get_tier(score: u32) -> String {
    match score {
        0..=19 => "New".to_string(),
        20..=39 => "Bronze".to_string(),
        40..=59 => "Silver".to_string(),
        60..=79 => "Gold".to_string(),
        80..=100 => "Diamond".to_string(),
        _ => "Unknown".to_string(),
    }
}

// ── Tests ────────────────────────────────────────────────────────────────

#[test]
fn test_credit_score_vectors_all() {
    let vectors = load_test_vectors();
    let env = Env::default();
    env.mock_all_auths();

    let now = env.ledger().timestamp();

    let mut passed = 0;
    let mut failed = 0;

    println!("\n=== Credit Score Vector Tests ===");
    println!("Version: {}", vectors.version);
    println!("Total vectors: {}\n", vectors.vectors.len());

    for vector in vectors.vectors.iter() {
        let profile = create_test_profile(&env, &vector.inputs, now);

        // Call the contract's credit score calculation
        let calculated_score = crate::credit::calculate_credit_score(&profile, now);
        let calculated_tier = get_tier(calculated_score);

        let matches = calculated_score == vector.expected_score
            && calculated_tier == vector.tier;

        if matches {
            println!("✓ PASS: {}", vector.id);
            passed += 1;
        } else {
            println!(
                "✗ FAIL: {}\n  Description: {}\n  Expected: score={}, tier={}\n  Got:      score={}, tier={}",
                vector.id,
                vector.description,
                vector.expected_score,
                vector.tier,
                calculated_score,
                calculated_tier
            );
            failed += 1;
        }
    }

    println!("\n=== Summary ===");
    println!("Passed: {}/{}", passed, vectors.vectors.len());
    println!("Failed: {}", failed);

    assert_eq!(
        failed, 0,
        "{} credit score vectors failed. See above for details.",
        failed
    );
}

/// Test a specific vector by ID for easy debugging
#[test]
fn test_credit_score_vector_zero_profile() {
    let vectors = load_test_vectors();
    let env = Env::default();
    env.mock_all_auths();

    let now = env.ledger().timestamp();

    let vector = vectors
        .vectors
        .iter()
        .find(|v| v.id == "zero_profile")
        .expect("Vector 'zero_profile' not found");

    let profile = create_test_profile(&env, &vector.inputs, now);
    let score = crate::credit::calculate_credit_score(&profile, now);

    assert_eq!(
        score, vector.expected_score,
        "zero_profile: expected {}, got {}",
        vector.expected_score, score
    );
}

#[test]
fn test_credit_score_vector_tier_boundaries() {
    let vectors = load_test_vectors();
    let env = Env::default();
    env.mock_all_auths();

    let now = env.ledger().timestamp();

    let tier_vectors: Vec<_> = vectors
        .vectors
        .iter()
        .filter(|v| v.id.contains("tier_boundary"))
        .collect();

    assert!(
        tier_vectors.len() >= 4,
        "Expected at least 4 tier boundary tests"
    );

    for vector in tier_vectors {
        let profile = create_test_profile(&env, &vector.inputs, now);
        let score = crate::credit::calculate_credit_score(&profile, now);
        let tier = get_tier(score);

        println!(
            "Tier test {}: score={}, tier={}",
            vector.id, score, tier
        );

        assert_eq!(
            score, vector.expected_score,
            "{}: expected score {}, got {}",
            vector.id, vector.expected_score, score
        );
        assert_eq!(
            tier, vector.tier,
            "{}: expected tier {}, got {}",
            vector.id, vector.tier, tier
        );
    }
}

#[test]
fn test_credit_score_vector_age_components() {
    let vectors = load_test_vectors();
    let env = Env::default();
    env.mock_all_auths();

    let now = env.ledger().timestamp();

    let age_vectors: Vec<_> = vectors
        .vectors
        .iter()
        .filter(|v| v.id.contains("age_"))
        .collect();

    assert!(
        age_vectors.len() >= 5,
        "Expected at least 5 age-related tests"
    );

    for vector in age_vectors {
        let profile = create_test_profile(&env, &vector.inputs, now);
        let score = crate::credit::calculate_credit_score(&profile, now);

        assert_eq!(
            score, vector.expected_score,
            "{}: age component test failed, expected {}, got {}",
            vector.id, vector.expected_score, score
        );
    }
}

#[test]
fn test_credit_score_vector_tip_components() {
    let vectors = load_test_vectors();
    let env = Env::default();
    env.mock_all_auths();

    let now = env.ledger().timestamp();

    let tip_vectors: Vec<_> = vectors
        .vectors
        .iter()
        .filter(|v| v.id.contains("tip") && !v.id.contains("streak"))
        .collect();

    assert!(
        tip_vectors.len() >= 3,
        "Expected at least 3 tip-related tests"
    );

    for vector in tip_vectors {
        let profile = create_test_profile(&env, &vector.inputs, now);
        let score = crate::credit::calculate_credit_score(&profile, now);

        assert_eq!(
            score, vector.expected_score,
            "{}: tip component test failed, expected {}, got {}",
            vector.id, vector.expected_score, score
        );
    }
}

#[test]
fn test_credit_score_vector_x_components() {
    let vectors = load_test_vectors();
    let env = Env::default();
    env.mock_all_auths();

    let now = env.ledger().timestamp();

    let x_vectors: Vec<_> = vectors
        .vectors
        .iter()
        .filter(|v| v.id.contains("x_"))
        .collect();

    assert!(
        x_vectors.len() >= 5,
        "Expected at least 5 X-related tests"
    );

    for vector in x_vectors {
        let profile = create_test_profile(&env, &vector.inputs, now);
        let score = crate::credit::calculate_credit_score(&profile, now);

        assert_eq!(
            score, vector.expected_score,
            "{}: X component test failed, expected {}, got {}",
            vector.id, vector.expected_score, score
        );
    }
}

#[test]
fn test_credit_score_vector_streak_components() {
    let vectors = load_test_vectors();
    let env = Env::default();
    env.mock_all_auths();

    let now = env.ledger().timestamp();

    let streak_vectors: Vec<_> = vectors
        .vectors
        .iter()
        .filter(|v| v.id.contains("streak"))
        .collect();

    assert!(
        streak_vectors.len() >= 2,
        "Expected at least 2 streak-related tests"
    );

    for vector in streak_vectors {
        let profile = create_test_profile(&env, &vector.inputs, now);
        let score = crate::credit::calculate_credit_score(&profile, now);

        assert_eq!(
            score, vector.expected_score,
            "{}: streak component test failed, expected {}, got {}",
            vector.id, vector.expected_score, score
        );
    }
}

#[test]
fn test_credit_score_vector_realistic_profiles() {
    let vectors = load_test_vectors();
    let env = Env::default();
    env.mock_all_auths();

    let now = env.ledger().timestamp();

    let realistic_vectors: Vec<_> = vectors
        .vectors
        .iter()
        .filter(|v| v.id.contains("realistic_creator"))
        .collect();

    assert!(
        realistic_vectors.len() >= 3,
        "Expected at least 3 realistic profile tests"
    );

    for vector in realistic_vectors {
        let profile = create_test_profile(&env, &vector.inputs, now);
        let score = crate::credit::calculate_credit_score(&profile, now);
        let tier = get_tier(score);

        println!(
            "Realistic {}: score={}, tier={}",
            vector.id, score, tier
        );

        assert_eq!(
            score, vector.expected_score,
            "{}: expected {}, got {}",
            vector.id, vector.expected_score, score
        );
        assert_eq!(
            tier, vector.tier,
            "{}: expected tier {}, got {}",
            vector.id, vector.tier, tier
        );
    }
}
