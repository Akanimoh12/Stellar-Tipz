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

use crate::errors::ContractError;
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

/// Minimum TTL threshold before a profile entry is extended (~7 days).
pub const PROFILE_TTL_MIN_LEDGERS: u32 = 120_960;

/// Target TTL for profile entries after a bump (~31 days).
pub const PROFILE_TTL_MAX_LEDGERS: u32 = 535_680;

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
    /// On-chain contract version, written during initialization and bumped on each upgrade
    ContractVersion,
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
    /// Emergency pause flag
    Paused,
    /// Minimum allowed tip amount in stroops
    MinTipAmount,
    /// Number of tips sent by a specific tipper
    TipperTipCount(Address),
    /// Reverse index: (tipper, local_index) → global tip ID
    TipperTip(Address, u32),
    /// Number of tips received by a specific creator
    CreatorTipCount(Address),
    /// Reverse index: (creator, local_index) → global tip ID
    CreatorTip(Address, u32),
    /// Pending admin address (proposed but not yet accepted)
    PendingAdmin,
    /// Verification status by creator address
    VerificationStatus(Address),
    /// Pending verification request by creator address
    VerificationRequest(Address),
    /// Subscription by (subscriber, creator)
    Subscription(Address, Address),
    /// Number of subscriptions for a subscriber
    SubscriberSubCount(Address),
    /// Index: (subscriber, index) -> creator
    SubscriberSub(Address, u32),
    /// Number of subscribers for a creator
    CreatorSubCount(Address),
    /// Index: (creator, index) -> subscriber
    CreatorSub(Address, u32),
    /// Pending withdrawal by (creator, withdrawal_id)
    PendingWithdrawal(Address, u32),
    /// Next withdrawal ID for a creator
    NextWithdrawalId(Address),
    /// Withdrawal cooldown in seconds
    WithdrawalCooldown,
    /// Large withdrawal threshold in stroops
    WithdrawalThreshold,
    /// Percentage of fees going to operations
    OpsFeePct,
    /// Percentage of fees going to staking pool
    PoolFeePct,
    /// Current pool balance
    PoolBalance,
    /// Multi-signature configuration
    MultisigConfig,
    /// Multi-sig proposal by ID
    Proposal(u32),
    /// Next proposal ID counter
    NextProposalId,
    /// Donation page config by creator
    DonationPage(Address),
    /// 24-hour stats window start timestamp
    StatsWindowStart,
    /// Tips count in last 24 hours
    TipsLast24h,
    /// Volume in last 24 hours
    VolumeLast24h,
    /// Active creators in last 30 days
    ActiveCreators30d,
    /// Creator last active timestamp
    CreatorLastActive(Address),
    /// Supporter streak by (supporter, creator)
    Streak(Address, Address),
    /// Aggregate streak bonus credited to a creator
    CreatorStreakBonus(Address),
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
// Pause state
// ──────────────────────────────────────────────────────────────────────────────

/// Returns `true` when the contract is paused.
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

/// Sets the paused flag.
pub fn set_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
}

// ──────────────────────────────────────────────────────────────────────────────
// Minimum tip amount
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the minimum allowed tip amount in stroops.
pub fn get_min_tip_amount(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::MinTipAmount)
        .unwrap_or(0_i128)
}

/// Sets the minimum allowed tip amount in stroops.
pub fn set_min_tip_amount(env: &Env, amount: i128) {
    env.storage()
        .instance()
        .set(&DataKey::MinTipAmount, &amount);
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

/// Returns the pending (proposed) admin address, or `None` if no proposal is active.
pub fn get_pending_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::PendingAdmin)
}

/// Stores a pending admin proposal.
pub fn set_pending_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::PendingAdmin, admin);
}

/// Removes any pending admin proposal.
pub fn remove_pending_admin(env: &Env) {
    env.storage().instance().remove(&DataKey::PendingAdmin);
}

// ──────────────────────────────────────────────────────────────────────────────
// Contract version
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the stored contract version, or 0 if not yet initialized.
pub fn get_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::ContractVersion)
        .unwrap_or(0)
}

/// Sets the stored contract version.
pub fn set_version(env: &Env, version: u32) {
    env.storage()
        .instance()
        .set(&DataKey::ContractVersion, &version);
}

// ──────────────────────────────────────────────────────────────────────────────
// Fee basis points
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the withdrawal fee in basis points (100 bps = 1 %).
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

/// Remove a profile from persistent storage.
pub fn remove_profile(env: &Env, address: &Address) {
    env.storage()
        .persistent()
        .remove(&DataKey::Profile(address.clone()));
}

/// Remove a username reverse-lookup entry from persistent storage.
pub fn remove_username_address(env: &Env, username: &String) {
    env.storage()
        .persistent()
        .remove(&DataKey::UsernameToAddress(username.clone()));
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

/// Bumps the TTL for both `Profile` and `UsernameToAddress` entries together,
/// preventing TTL desync between the two persistent storage entries.
///
/// Must be called on every profile interaction (register, update, tip, withdraw).
pub fn bump_profile_ttl(env: &Env, address: &Address) {
    let profile_key = DataKey::Profile(address.clone());
    if env.storage().persistent().has(&profile_key) {
        env.storage().persistent().extend_ttl(
            &profile_key,
            PROFILE_TTL_MIN_LEDGERS,
            PROFILE_TTL_MAX_LEDGERS,
        );
    }
}

/// Bumps the TTL for a `UsernameToAddress` entry.
///
/// Call this alongside [`bump_profile_ttl`] whenever the username is already
/// known, to keep both entries in sync without an extra storage read.
pub fn bump_username_ttl(env: &Env, username: &soroban_sdk::String) {
    let username_key = DataKey::UsernameToAddress(username.clone());
    if env.storage().persistent().has(&username_key) {
        env.storage().persistent().extend_ttl(
            &username_key,
            PROFILE_TTL_MIN_LEDGERS,
            PROFILE_TTL_MAX_LEDGERS,
        );
    }
}

/// Returns `true` only when both the `Profile` and its `UsernameToAddress`
/// reverse-lookup entry exist in persistent storage.
///
/// A profile is considered active only when both entries are live; if either
/// has expired the profile is in an orphaned state and should be treated as
/// absent.
pub fn is_profile_active(env: &Env, address: &Address) -> bool {
    let profile_key = DataKey::Profile(address.clone());
    if !env.storage().persistent().has(&profile_key) {
        return false;
    }
    let profile: crate::types::Profile = match env.storage().persistent().get(&profile_key) {
        Some(p) => p,
        None => return false,
    };
    env.storage()
        .persistent()
        .has(&DataKey::UsernameToAddress(profile.username))
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
// Per-tipper reverse index
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the number of tips sent by `tipper`.
pub fn get_tipper_tip_count(env: &Env, tipper: &Address) -> u32 {
    env.storage()
        .temporary()
        .get(&DataKey::TipperTipCount(tipper.clone()))
        .unwrap_or(0)
}

/// Records a new tip ID for `tipper` and bumps the per-tipper count.
/// The reverse-index entry shares the same TTL as tip records.
pub fn add_tipper_tip(env: &Env, tipper: &Address, tip_id: u32) {
    let local_index = get_tipper_tip_count(env, tipper);

    let idx_key = DataKey::TipperTip(tipper.clone(), local_index);
    env.storage().temporary().set(&idx_key, &tip_id);
    set_tip_ttl(env, &idx_key);

    let count_key = DataKey::TipperTipCount(tipper.clone());
    env.storage()
        .temporary()
        .set(&count_key, &(local_index + 1));
    set_tip_ttl(env, &count_key);
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-creator reverse index
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the number of tips received by `creator` (within the TTL window).
pub fn get_creator_tip_count(env: &Env, creator: &Address) -> u32 {
    env.storage()
        .temporary()
        .get(&DataKey::CreatorTipCount(creator.clone()))
        .unwrap_or(0)
}

/// Records a new tip ID for `creator` and bumps the per-creator count.
/// The reverse-index entry shares the same TTL as tip records.
pub fn add_creator_tip(env: &Env, creator: &Address, tip_id: u32) {
    let local_index = get_creator_tip_count(env, creator);

    let idx_key = DataKey::CreatorTip(creator.clone(), local_index);
    env.storage().temporary().set(&idx_key, &tip_id);
    set_tip_ttl(env, &idx_key);

    let count_key = DataKey::CreatorTipCount(creator.clone());
    env.storage()
        .temporary()
        .set(&count_key, &(local_index + 1));
    set_tip_ttl(env, &count_key);
}

/// Remove all per-creator tip index entries from temporary storage.
///
/// Called during `deregister_profile` to prevent stale `CreatorTipCount` from
/// causing index collisions when the same address re-registers later.
pub fn reset_creator_tip_index(env: &Env, creator: &Address) {
    let count = get_creator_tip_count(env, creator);
    let mut i: u32 = 0;
    while i < count {
        let key = DataKey::CreatorTip(creator.clone(), i);
        if env.storage().temporary().has(&key) {
            env.storage().temporary().remove(&key);
        }
        i += 1;
    }
    let count_key = DataKey::CreatorTipCount(creator.clone());
    if env.storage().temporary().has(&count_key) {
        env.storage().temporary().remove(&count_key);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Streak tracking
// ──────────────────────────────────────────────────────────────────────────────

/// Return the streak record for a supporter/creator pair, if any.
pub fn get_streak(env: &Env, supporter: &Address, creator: &Address) -> Option<crate::types::Streak> {
    env.storage()
        .persistent()
        .get(&DataKey::Streak(supporter.clone(), creator.clone()))
}

/// Persist a streak record for a supporter/creator pair.
pub fn set_streak(env: &Env, streak: &crate::types::Streak) {
    env.storage().persistent().set(
        &DataKey::Streak(streak.supporter.clone(), streak.creator.clone()),
        streak,
    );
}

/// Return the total streak bonus accumulated for a creator.
pub fn get_creator_streak_bonus(env: &Env, creator: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::CreatorStreakBonus(creator.clone()))
        .unwrap_or(0)
}

/// Add streak bonus points to a creator.
pub fn add_creator_streak_bonus(env: &Env, creator: &Address, bonus: u32) {
    if bonus == 0 {
        return;
    }
    let key = DataKey::CreatorStreakBonus(creator.clone());
    let current = get_creator_streak_bonus(env, creator);
    env.storage()
        .persistent()
        .set(&key, &(current.saturating_add(bonus)));
}

/// Adjust a creator's streak bonus by a signed delta.
pub fn adjust_creator_streak_bonus(env: &Env, creator: &Address, delta: i32) {
    if delta == 0 {
        return;
    }

    let key = DataKey::CreatorStreakBonus(creator.clone());
    let current = get_creator_streak_bonus(env, creator) as i32;
    let next = (current + delta).max(0) as u32;
    env.storage().persistent().set(&key, &next);
}

/// Remove all per-tipper tip index entries from temporary storage.
///
/// Called during `deregister_profile` to prevent stale `TipperTipCount` from
/// causing index collisions when the same address re-registers later.
pub fn reset_tipper_tip_index(env: &Env, tipper: &Address) {
    let count = get_tipper_tip_count(env, tipper);
    let mut i: u32 = 0;
    while i < count {
        let key = DataKey::TipperTip(tipper.clone(), i);
        if env.storage().temporary().has(&key) {
            env.storage().temporary().remove(&key);
        }
        i += 1;
    }
    let count_key = DataKey::TipperTipCount(tipper.clone());
    if env.storage().temporary().has(&count_key) {
        env.storage().temporary().remove(&count_key);
    }
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

/// Decrements the total registered creators counter by one.
/// Includes underflow protection (only decrements if total > 0).
pub fn decrement_total_creators(env: &Env) {
    let total = get_total_creators(env);
    if total > 0 {
        env.storage()
            .instance()
            .set(&DataKey::TotalCreators, &(total - 1));
    }
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
pub fn add_to_tips_volume(env: &Env, amount: i128) -> Result<(), ContractError> {
    let volume = get_total_tips_volume(env);
    // Security: fail closed on arithmetic overflow.
    let next = volume
        .checked_add(amount)
        .ok_or(ContractError::OverflowError)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalTipsVolume, &next);
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────────
// Fee tracking
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the lifetime total fees collected in stroops.
pub fn get_total_fees(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalFeesCollected)
        .unwrap_or(0)
}

/// Adds `fee` stroops to the lifetime fees collected.
#[allow(dead_code)]
pub fn add_to_fees(env: &Env, fee: i128) -> Result<(), ContractError> {
    let total = get_total_fees(env);
    // Security: fail closed on arithmetic overflow.
    let next = total.checked_add(fee).ok_or(ContractError::OverflowError)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalFeesCollected, &next);
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::storage::{Instance, Temporary};
    use soroban_sdk::{testutils::Address as _, Env, Map, Symbol};

    use crate::types::{VerificationStatus, VerificationType};
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
            website: String::from_str(&env, ""),
            image_url: String::from_str(&env, ""),
            social_links: Map::<Symbol, String>::new(&env),
            x_handle: String::from_str(&env, ""),
            x_followers: 0,
            x_engagement_avg: 0,
            credit_score: 40,
            total_tips_received: 0,
            total_tips_count: 0,
            balance: 0,
            registered_at: 0,
            updated_at: 0,
            verification: VerificationStatus {
                is_verified: false,
                verification_type: VerificationType::Unverified,
                verified_at: None,
                revoked_at: None,
            },
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
            website: String::from_str(&env, ""),
            image_url: String::from_str(&env, ""),
            social_links: Map::<Symbol, String>::new(&env),
            x_handle: String::from_str(&env, ""),
            x_followers: 0,
            x_engagement_avg: 0,
            credit_score: 40,
            total_tips_received: 0,
            total_tips_count: 0,
            balance: 500,
            registered_at: 100,
            updated_at: 200,
            verification: VerificationStatus {
                is_verified: false,
                verification_type: VerificationType::Unverified,
                verified_at: None,
                revoked_at: None,
            },
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
            add_to_tips_volume(&env, 1_000_000).unwrap();
            add_to_tips_volume(&env, 2_000_000).unwrap();
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
            add_to_fees(&env, 500).unwrap();
            add_to_fees(&env, 300).unwrap();
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

    #[test]
    fn remove_profile_removes_entry() {
        use soroban_sdk::testutils::Address as _;
        let (env, id) = make_env();
        let owner = Address::generate(&env);
        let profile = Profile {
            owner: owner.clone(),
            username: String::from_str(&env, "testuser"),
            display_name: String::from_str(&env, "Test User"),
            bio: String::from_str(&env, ""),
            website: String::from_str(&env, ""),
            image_url: String::from_str(&env, ""),
            social_links: Map::<Symbol, String>::new(&env),
            x_handle: String::from_str(&env, ""),
            x_followers: 0,
            x_engagement_avg: 0,
            credit_score: 40,
            total_tips_received: 0,
            total_tips_count: 0,
            balance: 0,
            registered_at: 0,
            updated_at: 0,
            verification: VerificationStatus {
                is_verified: false,
                verification_type: VerificationType::Unverified,
                verified_at: None,
                revoked_at: None,
            },
        };
        env.as_contract(&id, || {
            // Set profile
            set_profile(&env, &profile);
            assert!(has_profile(&env, &owner));

            // Remove profile
            remove_profile(&env, &owner);
            assert!(!has_profile(&env, &owner));
        });
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Verification storage functions
// ──────────────────────────────────────────────────────────────────────────────

#[allow(dead_code)]
pub fn get_verification_status(
    env: &Env,
    address: &Address,
) -> Option<crate::types::VerificationStatus> {
    env.storage()
        .persistent()
        .get(&DataKey::VerificationStatus(address.clone()))
}

#[allow(dead_code)]
pub fn set_verification_status(
    env: &Env,
    address: &Address,
    status: &crate::types::VerificationStatus,
) {
    env.storage()
        .persistent()
        .set(&DataKey::VerificationStatus(address.clone()), status);
    bump_profile_ttl(env, address);
}

#[allow(dead_code)]
pub fn remove_verification_status(env: &Env, address: &Address) {
    env.storage()
        .persistent()
        .remove(&DataKey::VerificationStatus(address.clone()));
}

#[allow(dead_code)]
pub fn get_verification_request(
    env: &Env,
    address: &Address,
) -> Option<crate::types::VerificationType> {
    env.storage()
        .persistent()
        .get(&DataKey::VerificationRequest(address.clone()))
}

pub fn set_verification_request(
    env: &Env,
    address: &Address,
    verification_type: &crate::types::VerificationType,
) {
    env.storage().persistent().set(
        &DataKey::VerificationRequest(address.clone()),
        verification_type,
    );
    bump_profile_ttl(env, address);
}

pub fn remove_verification_request(env: &Env, address: &Address) {
    env.storage()
        .persistent()
        .remove(&DataKey::VerificationRequest(address.clone()));
}


// ──────────────────────────────────────────────────────────────────────────────
// Donation page storage functions
// ──────────────────────────────────────────────────────────────────────────────

pub fn get_donation_page(env: &Env, creator: &Address) -> Option<crate::types::DonationPageConfig> {
    env.storage()
        .persistent()
        .get(&DataKey::DonationPage(creator.clone()))
}

pub fn set_donation_page(
    env: &Env,
    creator: &Address,
    config: &crate::types::DonationPageConfig,
) {
    env.storage()
        .persistent()
        .set(&DataKey::DonationPage(creator.clone()), config);
    bump_profile_ttl(env, creator);
}

// ──────────────────────────────────────────────────────────────────────────────
// Stats storage functions
// ──────────────────────────────────────────────────────────────────────────────

pub fn get_stats_window_start(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::StatsWindowStart)
        .unwrap_or(0)
}

pub fn set_stats_window_start(env: &Env, timestamp: u64) {
    env.storage()
        .instance()
        .set(&DataKey::StatsWindowStart, &timestamp);
}

pub fn get_tips_last_24h(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TipsLast24h)
        .unwrap_or(0)
}

pub fn set_tips_last_24h(env: &Env, count: u32) {
    env.storage()
        .instance()
        .set(&DataKey::TipsLast24h, &count);
}

pub fn get_volume_last_24h(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::VolumeLast24h)
        .unwrap_or(0)
}

pub fn set_volume_last_24h(env: &Env, volume: i128) {
    env.storage()
        .instance()
        .set(&DataKey::VolumeLast24h, &volume);
}

pub fn get_active_creators_30d(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::ActiveCreators30d)
        .unwrap_or(0)
}

pub fn set_active_creators_30d(env: &Env, count: u32) {
    env.storage()
        .instance()
        .set(&DataKey::ActiveCreators30d, &count);
}

pub fn get_creator_last_active(env: &Env, creator: &Address) -> u64 {
    env.storage()
        .persistent()
        .get(&DataKey::CreatorLastActive(creator.clone()))
        .unwrap_or(0)
}

pub fn set_creator_last_active(env: &Env, creator: &Address, timestamp: u64) {
    env.storage()
        .persistent()
        .set(&DataKey::CreatorLastActive(creator.clone()), &timestamp);
}
