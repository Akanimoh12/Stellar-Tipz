//! Storage key collision and tier isolation tests.
//!
//! Verifies that the `DataKey` enum produces unique, non-colliding keys across
//! different users, different data types, and different storage tiers.
//!
//! Because `DataKey` is a `#[contracttype]` enum (XDR-serialised), we cannot
//! compare variants directly with `==`. Instead we use the storage API:
//! write a value under one key and assert the other key is absent.
//!
//! Properties tested:
//!   1. Same-variant key injectivity across addresses (Req 1.1–1.4)
//!   2. Cross-variant key injectivity for the same address (Req 2.1–2.4)
//!   3. Key construction is deterministic (Req 3.1–3.3)
//!   4. Storage tier isolation (Req 4.1–4.3)

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::storage::DataKey;
use crate::TipzContract;

// ── helper ────────────────────────────────────────────────────────────────────

/// Creates a test `Env` and registers the contract, returning both.
/// Storage operations must be executed inside `env.as_contract(&id, ...)`.
fn make_env() -> (Env, Address) {
    let env = Env::default();
    let id = env.register_contract(None, TipzContract);
    (env, id)
}

// ── Property 1: Same-variant key injectivity across addresses ─────────────────
// Validates: Requirements 1.1, 1.2, 1.3, 1.4
//
// Strategy: write a sentinel value under key(addr_a), then assert key(addr_b)
// is absent. If the keys were the same, the second `has` would return true.

#[test]
fn test_profile_keys_unique_across_addresses() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    env.as_contract(&id, || {
        env.storage().persistent().set(&DataKey::Profile(a), &true);
        assert!(!env.storage().persistent().has(&DataKey::Profile(b)));
    });
}

#[test]
fn test_tipper_tip_count_keys_unique_across_addresses() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    env.as_contract(&id, || {
        env.storage()
            .temporary()
            .set(&DataKey::TipperTipCount(a), &true);
        assert!(!env.storage().temporary().has(&DataKey::TipperTipCount(b)));
    });
}

#[test]
fn test_creator_tip_count_keys_unique_across_addresses() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    env.as_contract(&id, || {
        env.storage()
            .temporary()
            .set(&DataKey::CreatorTipCount(a), &true);
        assert!(!env.storage().temporary().has(&DataKey::CreatorTipCount(b)));
    });
}

#[test]
fn test_verification_status_keys_unique_across_addresses() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    env.as_contract(&id, || {
        env.storage()
            .persistent()
            .set(&DataKey::VerificationStatus(a), &true);
        assert!(!env
            .storage()
            .persistent()
            .has(&DataKey::VerificationStatus(b)));
    });
}

// ── Property 2: Cross-variant key injectivity for the same address ────────────
// Validates: Requirements 2.1, 2.2, 2.3, 2.4
//
// Strategy: write under variant A, assert variant B (same address) is absent.
// We use instance() as a neutral tier so both keys can be checked in the same
// namespace without TTL complications.

#[test]
fn test_profile_vs_tipper_tip_count_keys_unique() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    env.as_contract(&id, || {
        env.storage()
            .instance()
            .set(&DataKey::Profile(a.clone()), &true);
        assert!(!env
            .storage()
            .instance()
            .has(&DataKey::TipperTipCount(a)));
    });
}

#[test]
fn test_profile_vs_creator_tip_count_keys_unique() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    env.as_contract(&id, || {
        env.storage()
            .instance()
            .set(&DataKey::Profile(a.clone()), &true);
        assert!(!env
            .storage()
            .instance()
            .has(&DataKey::CreatorTipCount(a)));
    });
}

#[test]
fn test_tipper_vs_creator_tip_count_keys_unique() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    env.as_contract(&id, || {
        env.storage()
            .instance()
            .set(&DataKey::TipperTipCount(a.clone()), &true);
        assert!(!env
            .storage()
            .instance()
            .has(&DataKey::CreatorTipCount(a)));
    });
}

#[test]
fn test_verification_status_vs_profile_keys_unique() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    env.as_contract(&id, || {
        env.storage()
            .instance()
            .set(&DataKey::VerificationStatus(a.clone()), &true);
        assert!(!env.storage().instance().has(&DataKey::Profile(a)));
    });
}

// ── Property 3: Key construction is deterministic ─────────────────────────────
// Validates: Requirements 3.1, 3.2, 3.3
//
// Strategy: write under key(inputs), then assert has(key(same inputs)) == true.
// If key construction were non-deterministic the second lookup would miss.

#[test]
fn test_profile_key_is_deterministic() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    env.as_contract(&id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Profile(a.clone()), &true);
        assert!(env.storage().persistent().has(&DataKey::Profile(a)));
    });
}

#[test]
fn test_tipper_tip_count_key_is_deterministic() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    env.as_contract(&id, || {
        env.storage()
            .temporary()
            .set(&DataKey::TipperTipCount(a.clone()), &true);
        assert!(env
            .storage()
            .temporary()
            .has(&DataKey::TipperTipCount(a)));
    });
}

#[test]
fn test_tipper_tip_key_is_deterministic() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let n: u32 = 7;
    env.as_contract(&id, || {
        env.storage()
            .temporary()
            .set(&DataKey::TipperTip(a.clone(), n), &true);
        assert!(env
            .storage()
            .temporary()
            .has(&DataKey::TipperTip(a, n)));
    });
}

// ── Property 4: Storage tier isolation ───────────────────────────────────────
// Validates: Requirements 4.1, 4.2, 4.3

#[test]
fn test_instance_write_not_visible_in_persistent() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let key = DataKey::Profile(a);
    env.as_contract(&id, || {
        env.storage().instance().set(&key, &true);
        assert!(!env.storage().persistent().has(&key));
    });
}

#[test]
fn test_instance_write_not_visible_in_temporary() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let key = DataKey::Profile(a);
    env.as_contract(&id, || {
        env.storage().instance().set(&key, &true);
        assert!(!env.storage().temporary().has(&key));
    });
}

#[test]
fn test_persistent_write_not_visible_in_temporary() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let key = DataKey::Profile(a);
    env.as_contract(&id, || {
        env.storage().persistent().set(&key, &true);
        assert!(!env.storage().temporary().has(&key));
    });
}

#[test]
fn test_persistent_write_not_visible_in_instance() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let key = DataKey::Profile(a);
    env.as_contract(&id, || {
        env.storage().persistent().set(&key, &true);
        assert!(!env.storage().instance().has(&key));
    });
}

#[test]
fn test_temporary_write_not_visible_in_instance() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let key = DataKey::TipperTipCount(a);
    env.as_contract(&id, || {
        env.storage().temporary().set(&key, &true);
        assert!(!env.storage().instance().has(&key));
    });
}

#[test]
fn test_temporary_write_not_visible_in_persistent() {
    let (env, id) = make_env();
    let a = Address::generate(&env);
    let key = DataKey::TipperTipCount(a);
    env.as_contract(&id, || {
        env.storage().temporary().set(&key, &true);
        assert!(!env.storage().persistent().has(&key));
    });
}
