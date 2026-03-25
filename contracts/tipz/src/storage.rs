//! Storage keys and helper functions for the Tipz contract.
//!
//! ## Storage tiers
//!
//! | Tier | Usage |
//! |------|-------|
//! | `instance()` | Contract-wide config and counters (Admin, fee, TotalCreators, …) |
//! | `persistent()` | Per-entry long-lived data (Profile, username reverse-lookup) |
//! | `temporary()` | Short-lived tip records; TTL extended on write |
//!
//! All callers should go through the helpers in this module instead of
//! accessing raw storage directly.

use soroban_sdk::{contracttype, Address, Env, String};

use crate::types::Profile;

// ──────────────────────────────────────────────────────────────────────────────
// TTL constants
// ──────────────────────────────────────────────────────────────────────────────

/// Approximate 7-day TTL in ledgers at ~5 seconds per ledger.
pub const INSTANCE_TTL_MIN_LEDGERS: u32 = 120_960;

/// Approximate 31-day TTL in ledgers at ~5 seconds per ledger.
pub const INSTANCE_TTL_MAX_LEDGERS: u32 = 535_680;

/// Approximate 7-day TTL in ledgers at ~5 seconds per ledger.
pub const TIP_TTL_LEDGERS: u32 = 120_960;

// ──────────────────────────────────────────────────────────────────────────────
// DataKey
// ──────────────────────────────────────────────────────────────────────────────

/// Storage key enum for all contract data.
#[contracttype]
pub enum DataKey {
    /// Contract admin address
    Admin,
    /// Withdrawal fee in basis points
    FeePercent,
    /// Address that receives fees
    FeeCollector,
    /// Lifetime fees collected
    TotalFeesCollected,
    /// Creator profile by address
    Profile(Address),
    /// Reverse lookup: username → address
    UsernameToAddress(String),
    /// Global tip counter
    TipCount,
    /// Individual tip record by index
    Tip(u32),
    /// Leaderboard (top creators)
    Leaderboard,
    /// Total registered creators
    TotalCreators,
    /// Lifetime tip volume
    TotalTipsVolume,
    /// Flag indicating contract is initialized
    Initialized,
    /// Native XLM token contract address (SAC)
    NativeToken,
}

/// Extend the contract instance TTL when a write transaction starts.
pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_MIN_LEDGERS, INSTANCE_TTL_MAX_LEDGERS);
}

/// Set the TTL for a temporary tip record after storing it.
pub fn set_tip_ttl(env: &Env, key: &DataKey) {
    env.storage()
        .temporary()
        .extend_ttl(key, TIP_TTL_LEDGERS, TIP_TTL_LEDGERS);
}

// ──────────────────────────────────────────────────────────────────────────────
// Initialisation
// ──────────────────────────────────────────────────────────────────────────────

/// Returns `true` if the contract has been initialised.
pub fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Initialized)
}

/// Marks the contract as initialised.
pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&DataKey::Initialized, &true);
}

// ──────────────────────────────────────────────────────────────────────────────
// Native token
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the native XLM token contract address (SAC).
///
/// # Panics
/// Panics if the contract is not yet initialised.
pub fn get_native_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::NativeToken)
        .expect("native_token not set")
}

/// Sets the native XLM token contract address.
pub fn set_native_token(env: &Env, addr: &Address) {
    env.storage().instance().set(&DataKey::NativeToken, addr);
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the current admin address.
///
/// # Panics
/// Panics if the contract is not yet initialised.
#[allow(dead_code)]
pub fn get_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("admin not set")
}

/// Overwrites the admin address.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

// ──────────────────────────────────────────────────────────────────────────────
// Fee basis points
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the withdrawal fee in basis points (100 bps = 1 %).
#[allow(dead_code)]
pub fn get_fee_bps(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::FeePercent)
        .unwrap_or(0)
}

/// Sets the withdrawal fee in basis points.
pub fn set_fee_bps(env: &Env, fee_bps: u32) {
    env.storage().instance().set(&DataKey::FeePercent, &fee_bps);
}

// ──────────────────────────────────────────────────────────────────────────────
// Fee collector
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the address that receives collected fees.
///
/// # Panics
/// Panics if the contract is not yet initialised.
#[allow(dead_code)]
pub fn get_fee_collector(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::FeeCollector)
        .expect("fee_collector not set")
}

/// Sets the fee collector address.
pub fn set_fee_collector(env: &Env, addr: &Address) {
    env.storage().instance().set(&DataKey::FeeCollector, addr);
}

// ──────────────────────────────────────────────────────────────────────────────
// Profile CRUD
// ──────────────────────────────────────────────────────────────────────────────

/// Returns `true` if `address` has a registered profile.
pub fn has_profile(env: &Env, address: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Profile(address.clone()))
}

/// Returns the profile for `address`.
///
/// # Panics
/// Panics if no profile is registered for `address`. Callers should guard
/// with [`has_profile`] first.
pub fn get_profile(env: &Env, address: &Address) -> Profile {
    env.storage()
        .persistent()
        .get(&DataKey::Profile(address.clone()))
        .expect("profile not found")
}

/// Persists (creates or updates) a profile, keyed by `profile.owner`.
pub fn set_profile(env: &Env, profile: &Profile) {
    env.storage()
        .persistent()
        .set(&DataKey::Profile(profile.owner.clone()), profile);
}

// ──────────────────────────────────────────────────────────────────────────────
// Username reverse lookup
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the address associated with `username`, or `None` if not taken.
pub fn get_username_address(env: &Env, username: &String) -> Option<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::UsernameToAddress(username.clone()))
}

/// Stores the `username → address` reverse-lookup entry.
pub fn set_username_address(env: &Env, username: &String, address: &Address) {
    env.storage()
        .persistent()
        .set(&DataKey::UsernameToAddress(username.clone()), address);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tip counter
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the current global tip count (also the index of the *next* tip).
pub fn get_tip_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TipCount)
        .unwrap_or(0)
}

/// Atomically reads the current tip count, increments it in storage, and
/// returns the **pre-increment** value (the index to assign to the new tip).
pub fn increment_tip_count(env: &Env) -> u32 {
    let count = get_tip_count(env);
    env.storage()
        .instance()
        .set(&DataKey::TipCount, &(count + 1));
    count
}

// ──────────────────────────────────────────────────────────────────────────────
// Creator counter
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the total number of registered creators.
pub fn get_total_creators(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TotalCreators)
        .unwrap_or(0)
}

/// Increments the total registered creators counter by one.
pub fn increment_total_creators(env: &Env) {
    let total = get_total_creators(env);
    env.storage()
        .instance()
        .set(&DataKey::TotalCreators, &(total + 1));
}

// ──────────────────────────────────────────────────────────────────────────────
// Tips volume tracking
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the lifetime total tip volume in stroops.
pub fn get_total_tips_volume(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalTipsVolume)
        .unwrap_or(0)
}

/// Adds `amount` stroops to the lifetime tip volume.
pub fn add_to_tips_volume(env: &Env, amount: i128) {
    let volume = get_total_tips_volume(env);
    env.storage()
        .instance()
        .set(&DataKey::TotalTipsVolume, &(volume + amount));
}

// ──────────────────────────────────────────────────────────────────────────────
// Fee tracking
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the lifetime total fees collected in stroops.
#[allow(dead_code)]
pub fn get_total_fees(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalFeesCollected)
        .unwrap_or(0)
}

/// Adds `fee` stroops to the lifetime fees collected.
#[allow(dead_code)]
pub fn add_to_fees(env: &Env, fee: i128) {
    let total = get_total_fees(env);
    env.storage()
        .instance()
        .set(&DataKey::TotalFeesCollected, &(total + fee));
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::storage::{Instance, Temporary};
    use soroban_sdk::{testutils::Address as _, Env};

    use crate::TipzContract;

    /// Creates a test `Env` and registers the contract, returning both.
    /// Storage operations must be executed inside `env.as_contract(&id, ...)`.
    fn make_env() -> (Env, Address) {
        let env = Env::default();
        let id = env.register_contract(None, TipzContract);
        (env, id)
    }

    // ── is_initialized ────────────────────────────────────────────────────────

    #[test]
    fn is_initialized_false_before_set() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert!(!is_initialized(&env));
        });
    }

    #[test]
    fn is_initialized_true_after_set() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            env.storage().instance().set(&DataKey::Initialized, &true);
            assert!(is_initialized(&env));
        });
    }

    #[test]
    fn extend_instance_ttl_sets_expected_ttl() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            extend_instance_ttl(&env);
            assert_eq!(env.storage().instance().get_ttl(), INSTANCE_TTL_MAX_LEDGERS);
        });
    }

    // ── admin ─────────────────────────────────────────────────────────────────

    #[test]
    fn set_and_get_admin() {
        let (env, id) = make_env();
        let admin = Address::generate(&env);
        env.as_contract(&id, || {
            set_admin(&env, &admin);
            assert_eq!(get_admin(&env), admin);
        });
    }

    // ── fee bps ───────────────────────────────────────────────────────────────

    #[test]
    fn get_fee_bps_defaults_to_zero() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(get_fee_bps(&env), 0);
        });
    }

    #[test]
    fn set_and_get_fee_bps() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            set_fee_bps(&env, 200);
            assert_eq!(get_fee_bps(&env), 200);
        });
    }

    // ── fee collector ─────────────────────────────────────────────────────────

    #[test]
    fn set_and_get_fee_collector() {
        let (env, id) = make_env();
        let collector = Address::generate(&env);
        env.as_contract(&id, || {
            set_fee_collector(&env, &collector);
            assert_eq!(get_fee_collector(&env), collector);
        });
    }

    // ── profile ───────────────────────────────────────────────────────────────

    #[test]
    fn has_profile_false_when_absent() {
        let (env, id) = make_env();
        let addr = Address::generate(&env);
        env.as_contract(&id, || {
            assert!(!has_profile(&env, &addr));
        });
    }

    #[test]
    fn set_profile_and_has_profile() {
        let (env, id) = make_env();
        let owner = Address::generate(&env);
        let profile = Profile {
            owner: owner.clone(),
            username: String::from_str(&env, "alice"),
            display_name: String::from_str(&env, "Alice"),
            bio: String::from_str(&env, ""),
            image_url: String::from_str(&env, ""),
            x_handle: String::from_str(&env, ""),
            x_followers: 0,
            x_engagement_avg: 0,
            credit_score: 40,
            total_tips_received: 0,
            total_tips_count: 0,
            balance: 0,
            registered_at: 0,
            updated_at: 0,
        };
        env.as_contract(&id, || {
            set_profile(&env, &profile);
            assert!(has_profile(&env, &owner));
        });
    }

    #[test]
    fn get_profile_round_trips() {
        let (env, id) = make_env();
        let owner = Address::generate(&env);
        let profile = Profile {
            owner: owner.clone(),
            username: String::from_str(&env, "bob"),
            display_name: String::from_str(&env, "Bob"),
            bio: String::from_str(&env, ""),
            image_url: String::from_str(&env, ""),
            x_handle: String::from_str(&env, ""),
            x_followers: 0,
            x_engagement_avg: 0,
            credit_score: 40,
            total_tips_received: 0,
            total_tips_count: 0,
            balance: 500,
            registered_at: 100,
            updated_at: 200,
        };
        env.as_contract(&id, || {
            set_profile(&env, &profile);
            let retrieved = get_profile(&env, &owner);
            assert_eq!(retrieved.username, String::from_str(&env, "bob"));
            assert_eq!(retrieved.balance, 500);
            assert_eq!(retrieved.registered_at, 100);
        });
    }

    // ── username reverse lookup ───────────────────────────────────────────────

    #[test]
    fn get_username_address_none_when_absent() {
        let (env, id) = make_env();
        let username = String::from_str(&env, "ghost");
        env.as_contract(&id, || {
            assert_eq!(get_username_address(&env, &username), None);
        });
    }

    #[test]
    fn set_and_get_username_address() {
        let (env, id) = make_env();
        let addr = Address::generate(&env);
        let username = String::from_str(&env, "alice");
        env.as_contract(&id, || {
            set_username_address(&env, &username, &addr);
            assert_eq!(get_username_address(&env, &username), Some(addr));
        });
    }

    // ── tip counter ───────────────────────────────────────────────────────────

    #[test]
    fn get_tip_count_defaults_to_zero() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(get_tip_count(&env), 0);
        });
    }

    #[test]
    fn increment_tip_count_returns_pre_increment_value() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(increment_tip_count(&env), 0); // pre-increment → 0; stored → 1
            assert_eq!(get_tip_count(&env), 1);
            assert_eq!(increment_tip_count(&env), 1); // pre-increment → 1; stored → 2
            assert_eq!(get_tip_count(&env), 2);
        });
    }

    // ── total creators ────────────────────────────────────────────────────────

    #[test]
    fn get_total_creators_defaults_to_zero() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(get_total_creators(&env), 0);
        });
    }

    #[test]
    fn total_creators_increments_correctly() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            super::increment_total_creators(&env);
            assert_eq!(get_total_creators(&env), 1);
            super::increment_total_creators(&env);
            assert_eq!(get_total_creators(&env), 2);
        });
    }

    // ── tips volume ───────────────────────────────────────────────────────────

    #[test]
    fn get_total_tips_volume_defaults_to_zero() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(get_total_tips_volume(&env), 0);
        });
    }

    #[test]
    fn add_to_tips_volume_accumulates() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            add_to_tips_volume(&env, 1_000_000);
            add_to_tips_volume(&env, 2_000_000);
            assert_eq!(get_total_tips_volume(&env), 3_000_000);
        });
    }

    // ── fees ──────────────────────────────────────────────────────────────────

    #[test]
    fn get_total_fees_defaults_to_zero() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(get_total_fees(&env), 0);
        });
    }

    #[test]
    fn add_to_fees_accumulates() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            add_to_fees(&env, 500);
            add_to_fees(&env, 300);
            assert_eq!(get_total_fees(&env), 800);
        });
    }

    #[test]
    fn set_tip_ttl_sets_expected_ttl() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            let key = DataKey::Tip(7);
            env.storage().temporary().set(&key, &7_u32);
            set_tip_ttl(&env, &key);
            assert_eq!(env.storage().temporary().get_ttl(&key), TIP_TTL_LEDGERS);
        });
    }
}
