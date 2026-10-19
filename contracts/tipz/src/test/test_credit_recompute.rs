//! Tests for bounded, paginated credit score recomputation (issue #1185).
//!
//! Verifies:
//! - Single-page recompute covers all creators and returns is_done = true.
//! - Multi-page recompute covers all creators across multiple calls.
//! - Partial completion leaves state consistent (no half-updated scores).
//! - Empty creator set returns is_done immediately.
//! - limit is clamped to MAX_RECOMPUTE_PAGE_SIZE.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, Map, String, Symbol};

use crate::{
    credit::{recompute_credit_scores_page, MAX_RECOMPUTE_PAGE_SIZE},
    storage::{self, DataKey},
    types::{Profile, VerificationStatus, VerificationType},
    TipzContract,
};

fn make_env() -> Env {
    Env::default()
}

fn register_contract(env: &Env) -> Address {
    env.register_contract(None, TipzContract)
}

fn insert_creator(env: &Env, contract_id: &Address, tips: i128) -> Address {
    let addr = Address::generate(env);
    let now = env.ledger().timestamp();
    let profile = Profile {
        owner: addr.clone(),
        username: String::from_str(env, "u"),
        display_name: String::from_str(env, "U"),
        bio: String::from_str(env, ""),
        website: String::from_str(env, ""),
        image_url: String::from_str(env, ""),
        social_links: Map::<Symbol, String>::new(env),
        x_handle: String::from_str(env, ""),
        x_followers: 0,
        x_engagement_avg: 0,
        credit_score: 40,
        total_tips_received: tips,
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
    };
    env.as_contract(contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Profile(addr.clone()), &profile);
        // Add to creator dense index.
        storage::append_creator_to_index(env, &addr);
    });
    addr
}

// ── empty set ─────────────────────────────────────────────────────────────────

#[test]
fn empty_creator_set_returns_done() {
    let env = make_env();
    let contract_id = register_contract(&env);

    env.as_contract(&contract_id, || {
        let (next, done) = recompute_credit_scores_page(&env, 0, 10);
        assert_eq!(next, 0);
        assert!(done, "empty set should report done immediately");
    });
}

// ── single page ───────────────────────────────────────────────────────────────

#[test]
fn single_page_covers_all_creators() {
    let env = make_env();
    let contract_id = register_contract(&env);

    let n = 5_u32;
    for _ in 0..n {
        insert_creator(&env, &contract_id, 500_000_000); // 50 XLM each
    }

    env.as_contract(&contract_id, || {
        let (next, done) = recompute_credit_scores_page(&env, 0, n + 10);
        assert_eq!(next, n, "next_cursor should be total creator count");
        assert!(done);
    });
}

// ── multi-page ────────────────────────────────────────────────────────────────

#[test]
fn multi_page_covers_all_creators() {
    let env = make_env();
    let contract_id = register_contract(&env);

    let total = 7_u32;
    let page_size = 3_u32;
    for _ in 0..total {
        insert_creator(&env, &contract_id, 0);
    }

    env.as_contract(&contract_id, || {
        let mut cursor = 0_u32;
        let mut pages = 0_u32;
        loop {
            let (next, done) = recompute_credit_scores_page(&env, cursor, page_size);
            pages += 1;
            cursor = next;
            if done {
                break;
            }
            assert!(pages < 100, "recompute stuck in infinite loop");
        }
        // 7 creators with page size 3 → 3 pages (3 + 3 + 1).
        assert_eq!(cursor, total, "cursor should reach total after all pages");
        assert_eq!(pages, 3, "should take ceil(7/3) = 3 pages");
    });
}

// ── score update correctness ──────────────────────────────────────────────────

#[test]
fn recompute_updates_stale_credit_score() {
    let env = make_env();
    let contract_id = register_contract(&env);

    // Insert with wrong credit_score (40) but high tip volume that should yield 60.
    let addr = insert_creator(&env, &contract_id, 1_000_000_000); // 100 XLM

    env.as_contract(&contract_id, || {
        // Confirm initial stored score is wrong (40, the blank default).
        let before: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(addr.clone()))
            .unwrap();
        assert_eq!(before.credit_score, 40);

        recompute_credit_scores_page(&env, 0, 10);

        let after: Profile = env
            .storage()
            .persistent()
            .get(&DataKey::Profile(addr.clone()))
            .unwrap();
        // 40 base + 20 tip pts = 60 (no X metrics, no age).
        assert_eq!(after.credit_score, 60, "score should be corrected by recompute");
    });
}

// ── consistent partial state ──────────────────────────────────────────────────

#[test]
fn partial_recompute_leaves_consistent_state() {
    let env = make_env();
    let contract_id = register_contract(&env);

    let total = 6_u32;
    let mut addrs = soroban_sdk::Vec::new(&env);
    for i in 0..total {
        // Alternate between 0 and max tips so recompute actually changes scores.
        let tips = if i % 2 == 0 { 1_000_000_000_i128 } else { 0 };
        addrs.push_back(insert_creator(&env, &contract_id, tips));
    }

    env.as_contract(&contract_id, || {
        // Process only the first half.
        let (next, done) = recompute_credit_scores_page(&env, 0, 3);
        assert_eq!(next, 3);
        assert!(!done);

        // First 3 profiles should now have correct scores.
        for i in 0_u32..3_u32 {
            let addr: Address = addrs.get(i).unwrap();
            let p: Profile = env
                .storage()
                .persistent()
                .get(&DataKey::Profile(addr))
                .unwrap();
            let expected = if i % 2 == 0 { 60 } else { 40 };
            assert_eq!(p.credit_score, expected, "creator {i} score mismatch after partial recompute");
        }

        // Last 3 profiles should still have old stored score (40).
        for i in 3_u32..total {
            let addr: Address = addrs.get(i).unwrap();
            let p: Profile = env
                .storage()
                .persistent()
                .get(&DataKey::Profile(addr))
                .unwrap();
            assert_eq!(p.credit_score, 40, "unprocessed creator {i} score must be untouched");
        }
    });
}

// ── page size clamped ─────────────────────────────────────────────────────────

#[test]
fn limit_clamped_to_max_page_size() {
    let env = make_env();
    let contract_id = register_contract(&env);

    // Insert more creators than MAX_RECOMPUTE_PAGE_SIZE.
    let total = MAX_RECOMPUTE_PAGE_SIZE + 5;
    for _ in 0..total {
        insert_creator(&env, &contract_id, 0);
    }

    env.as_contract(&contract_id, || {
        // Even with an unlimited limit, only MAX_RECOMPUTE_PAGE_SIZE are processed.
        let (next, done) = recompute_credit_scores_page(&env, 0, u32::MAX);
        assert_eq!(next, MAX_RECOMPUTE_PAGE_SIZE, "next_cursor should advance by clamped limit");
        assert!(!done, "should not be done after one clamped page");
    });
}
