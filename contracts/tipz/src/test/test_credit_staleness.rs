//! Tests for credit score staleness reporting (issue #1186).
//!
//! Verifies:
//! - A freshly stored score reports `is_stale = false`.
//! - A score stored exactly at the threshold is not yet stale.
//! - A score older than the threshold is marked stale.
//! - A score that was never stored (`computed_at_ledger == 0`) is always stale.
//! - The staleness threshold is configurable by admin.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, Map, String, Symbol};

use crate::{
    credit::{get_credit_breakdown, mark_credit_computed},
    storage::{self, DataKey, get_credit_staleness_threshold, set_credit_staleness_threshold},
    types::{
        CreditTier, Profile, VerificationStatus, VerificationType,
        DEFAULT_CREDIT_STALENESS_THRESHOLD_LEDGERS,
    },
    TipzContract,
};

fn make_env() -> Env {
    Env::default()
}

fn register_contract(env: &Env) -> Address {
    env.register_contract(None, TipzContract)
}

fn blank_profile(env: &Env, owner: &Address, now: u64) -> Profile {
    Profile {
        owner: owner.clone(),
        username: String::from_str(env, "creator"),
        display_name: String::from_str(env, "Creator"),
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
        registered_at: now,
        updated_at: now,
        last_active_at: now,
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

// ── never stored → always stale ───────────────────────────────────────────────

#[test]
fn unstored_score_is_always_stale() {
    let env = make_env();
    let contract_id = register_contract(&env);
    let address = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let now = env.ledger().timestamp();
        let profile = blank_profile(&env, &address, now);
        env.storage()
            .persistent()
            .set(&DataKey::Profile(address.clone()), &profile);

        let breakdown = get_credit_breakdown(&env, &address).unwrap();
        assert_eq!(breakdown.computed_at_ledger, 0, "never stored → computed_at = 0");
        assert!(breakdown.is_stale, "unstored score must be stale");
    });
}

// ── fresh score → not stale ───────────────────────────────────────────────────

#[test]
fn freshly_stored_score_is_not_stale() {
    let env = make_env();
    let contract_id = register_contract(&env);
    let address = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let now = env.ledger().timestamp();
        let profile = blank_profile(&env, &address, now);
        env.storage()
            .persistent()
            .set(&DataKey::Profile(address.clone()), &profile);

        // Store at the current ledger.
        mark_credit_computed(&env, &address);
        let current_ledger = env.ledger().sequence();

        let breakdown = get_credit_breakdown(&env, &address).unwrap();
        assert_eq!(breakdown.computed_at_ledger, current_ledger);
        assert_eq!(breakdown.ledger_age, 0);
        assert!(!breakdown.is_stale, "score stored this ledger should not be stale");
    });
}

// ── exactly at threshold → not yet stale ─────────────────────────────────────

#[test]
fn score_exactly_at_threshold_is_not_stale() {
    let env = make_env();
    let contract_id = register_contract(&env);
    let address = Address::generate(&env);
    let threshold = 100_u32;

    env.as_contract(&contract_id, || {
        let now = env.ledger().timestamp();
        let profile = blank_profile(&env, &address, now);
        env.storage()
            .persistent()
            .set(&DataKey::Profile(address.clone()), &profile);

        set_credit_staleness_threshold(&env, threshold);

        // Store at ledger 1.
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 1,
            ..env.ledger().get()
        });
        mark_credit_computed(&env, &address);

        // Advance to exactly the threshold ledger.
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 1 + threshold,
            ..env.ledger().get()
        });

        let breakdown = get_credit_breakdown(&env, &address).unwrap();
        assert_eq!(breakdown.ledger_age, threshold);
        // age == threshold is not yet stale (strictly >).
        assert!(!breakdown.is_stale, "age == threshold should not be stale");
    });
}

// ── one ledger past threshold → stale ────────────────────────────────────────

#[test]
fn score_past_threshold_is_stale() {
    let env = make_env();
    let contract_id = register_contract(&env);
    let address = Address::generate(&env);
    let threshold = 100_u32;

    env.as_contract(&contract_id, || {
        let now = env.ledger().timestamp();
        let profile = blank_profile(&env, &address, now);
        env.storage()
            .persistent()
            .set(&DataKey::Profile(address.clone()), &profile);

        set_credit_staleness_threshold(&env, threshold);

        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 1,
            ..env.ledger().get()
        });
        mark_credit_computed(&env, &address);

        // One ledger past threshold.
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 1 + threshold + 1,
            ..env.ledger().get()
        });

        let breakdown = get_credit_breakdown(&env, &address).unwrap();
        assert!(breakdown.is_stale, "age > threshold must be stale");
    });
}

// ── configurable threshold ────────────────────────────────────────────────────

#[test]
fn default_staleness_threshold_matches_constant() {
    let env = make_env();
    let contract_id = register_contract(&env);

    env.as_contract(&contract_id, || {
        assert_eq!(
            get_credit_staleness_threshold(&env),
            DEFAULT_CREDIT_STALENESS_THRESHOLD_LEDGERS
        );
    });
}

#[test]
fn set_staleness_threshold_changes_stale_classification() {
    let env = make_env();
    let contract_id = register_contract(&env);
    let address = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let now = env.ledger().timestamp();
        let profile = blank_profile(&env, &address, now);
        env.storage()
            .persistent()
            .set(&DataKey::Profile(address.clone()), &profile);

        // Store at ledger 1.
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 1,
            ..env.ledger().get()
        });
        mark_credit_computed(&env, &address);

        // Advance 50 ledgers — within default threshold of 8,640.
        env.ledger().set(soroban_sdk::testutils::LedgerInfo {
            sequence_number: 51,
            ..env.ledger().get()
        });

        // With default threshold (8,640), not stale.
        let bd = get_credit_breakdown(&env, &address).unwrap();
        assert!(!bd.is_stale, "50 ledgers should not exceed default threshold");

        // Tighten to 10 — now stale.
        set_credit_staleness_threshold(&env, 10);
        let bd = get_credit_breakdown(&env, &address).unwrap();
        assert!(bd.is_stale, "50 ledgers should exceed tight threshold of 10");
    });
}
