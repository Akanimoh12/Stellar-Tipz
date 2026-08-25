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

use soroban_sdk::{contracttype, symbol_short, Address, Env, String, Symbol};

use crate::errors::ContractError;
use crate::types::{
    LeaderboardEntry, LeaderboardPeriod, Profile, RateLimitConfig, RateLimitStatus,
};

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

// Per-entry-type persistent TTL policy (#1175).
//
// Two tiers, so no persistent entry silently archives mid-lifecycle:
//
// | Tier       | Entries                              | Min bump | Extend-to |
// |------------|--------------------------------------|----------|-----------|
// | `Balance`  | `Profile`, `TokenBalance`            | ~7 days  | ~31 days  |
// | `Standard` | username, streak, goal, donation, …  | ~7 days  | ~15 days  |
//
// Balance-bearing entries get the longest target so a creator's funds can
// never become inaccessible before their metadata does.

/// Minimum remaining TTL before a balance-bearing entry is extended (~7 days).
pub const BALANCE_TTL_MIN_LEDGERS: u32 = 120_960;
/// Extend-to target for balance-bearing entries after a bump (~31 days).
pub const BALANCE_TTL_MAX_LEDGERS: u32 = 535_680;

/// Minimum remaining TTL before a standard persistent entry is extended (~7 days).
pub const PERSISTENT_TTL_MIN_LEDGERS: u32 = 120_960;
/// Extend-to target for standard persistent entries after a bump (~15 days).
pub const PERSISTENT_TTL_MAX_LEDGERS: u32 = 267_840;

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
    /// Leaderboard (top creators) per period
    Leaderboard(crate::types::LeaderboardPeriod),
    /// Timestamp of last leaderboard reset per period
    LastLeaderboardReset(crate::types::LeaderboardPeriod),
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
    /// Reentrancy guard: set before fund-moving external calls
    ReentrancyGuard,
    /// Number of tips sent by a specific tipper
    TipperTipCount(Address),
    /// Reverse index: (tipper, local_index) → global tip ID
    TipperTip(Address, u32),
    /// Number of tips received by a specific creator
    CreatorTipCount(Address),
    /// Reverse index: (creator, local_index) → global tip ID
    CreatorTip(Address, u32),
    /// Pending two-step admin change proposal (full transition record).
    PendingAdminChange,
    /// Admin change history list (newest entries appended last).
    AdminChangeHistory,
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
    /// Rate limit status by address
    RateLimit(Address),
    /// Global rate limit configuration
    RateLimitConfig,
    /// Tips received by a creator during a specific period (Address, Period, StartTimestamp)
    CreatorPeriodVolume(Address, crate::types::LeaderboardPeriod, u64),
    /// Maximum active subscriptions per subscriber
    SubscriptionLimit,
    /// Reentrancy guard: set before fund-moving external calls
    ReentrancyGuard,
}

/// Extended storage keys for new features (separate enum to avoid size limits)
#[contracttype]
pub enum ExtendedDataKey {
    /// Active goal for a creator
    ActiveGoal(Address),
    /// Archived goals for a creator
    ArchivedGoals(Address),
    /// Accepted token configuration by token address
    AcceptedToken(Address),
    /// List of all accepted token addresses
    AcceptedTokenList,
    /// Token balance for a creator by (creator, token)
    TokenBalance(Address, Address),
    /// Refund request by tip ID
    RefundRequest(u32),
    /// Refund configuration
    RefundConfig,
    /// Number of pending refund requests tracked for cursor-based iteration.
    PendingRefundCount,
    /// Pending refund request tip ID by dense index.
    PendingRefundTip(u32),
    /// Bounded ring-buffered log of all privileged admin actions.
    AdminAuditLog,
    /// Counter for total recorded admin audit entries over time.
    AdminAuditCount,
    /// When set, profile is deactivated (unix timestamp); absent means active
    ProfileDeactivatedAt(Address),
    /// Creator-level blocked tipper entry `(creator, tipper)`.
    CreatorBlockedTipper(Address, Address),
    /// Active blocked-tipper count for a creator.
    CreatorBlockedTipperCount(Address),
    /// Proposed contract upgrade WASM hash awaiting execution.
    ProposedUpgradeHash,
    /// Scheduled tip counter
    ScheduledTipCount,
    /// Scheduled tip record by ID
    ScheduledTip(u32),
    /// Number of scheduled tips sent by a sender
    SenderScheduledTipCount(Address),
    /// Index: (sender, local_index) -> scheduled_tip_id
    SenderScheduledTip(Address, u32),
    /// Number of scheduled tips for a creator
    CreatorScheduledTipCount(Address),
    /// Index: (creator, local_index) -> scheduled_tip_id
    CreatorScheduledTip(Address, u32),
    /// Unix timestamp when contract was paused.
    PausedAt,
    /// State tracking for storage migration harness.
    MigrationState,
    /// Active subscriptions list by subscriber (Vec<(subscriber, creator)>)
    ActiveSubscriptions,
    /// Minimum explicit withdrawal amount in stroops.
    MinWithdrawalAmount,
}

/// Storage keys for compact performance caches.
#[contracttype]
pub enum CacheKey {
    RuntimeConfig,
    LeaderboardSet,
    CreatorPeriodVolumes(Address),
    SendTipState,
}

/// Frequently-read runtime configuration kept under one instance key.
#[contracttype]
#[derive(Clone)]
pub struct RuntimeConfig {
    pub admin: Address,
    pub fee_collector: Address,
    pub fee_bps: u32,
    pub fee_change_delay_ledgers: u32,
    pub native_token: Address,
    pub paused: bool,
    pub min_tip_amount: i128,
    pub rate_limit: RateLimitConfig,
    /// Domain re-verification interval in seconds (default 30 days)
    pub domain_reverify_secs: u64,
}

/// All leaderboard periods cached under one key for write-heavy operations.
#[contracttype]
#[derive(Clone)]
pub struct LeaderboardSet {
    pub all_time: soroban_sdk::Vec<LeaderboardEntry>,
    pub monthly: soroban_sdk::Vec<LeaderboardEntry>,
    pub weekly: soroban_sdk::Vec<LeaderboardEntry>,
    pub monthly_reset_at: u64,
    pub weekly_reset_at: u64,
}

/// Cached non-all-time tip volumes for a creator.
#[contracttype]
#[derive(Clone)]
pub struct CreatorPeriodVolumes {
    pub monthly_start_at: u64,
    pub monthly: i128,
    pub weekly_start_at: u64,
    pub weekly: i128,
}

/// Global counters commonly updated during `send_tip`.
#[contracttype]
#[derive(Clone)]
pub struct SendTipState {
    pub tip_count: u32,
    pub total_tips_volume: i128,
    pub stats_window_start: u64,
    pub tips_last_24h: u32,
    pub volume_last_24h: i128,
    pub active_creators_30d: u32,
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

/// TTL tier for a persistent entry. Balance-bearing entries get the longest
/// target so funds never archive before metadata.
pub(crate) enum PersistentTier {
    /// `Profile`, `TokenBalance` — longest TTL.
    Balance,
    /// Everything else in persistent storage.
    Standard,
}

/// The single shared persistent-TTL bump. Every persistent read and write path
/// routes through this helper, so there is exactly one place a TTL policy can
/// be forgotten — the failure mode this issue exists to remove (#1175).
///
/// No-op when the entry is absent, so it is safe to call after a read that may
/// have missed. Generic over the key type because balances live under
/// `ExtendedDataKey` while the rest live under `DataKey`.
pub(crate) fn extend_persistent_ttl<K>(env: &Env, key: &K, tier: PersistentTier)
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
{
    if env.storage().persistent().has(key) {
        let (min, max) = match tier {
            PersistentTier::Balance => (BALANCE_TTL_MIN_LEDGERS, BALANCE_TTL_MAX_LEDGERS),
            PersistentTier::Standard => (PERSISTENT_TTL_MIN_LEDGERS, PERSISTENT_TTL_MAX_LEDGERS),
        };
        env.storage().persistent().extend_ttl(key, min, max);
    }
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
    if let Some(config) = get_runtime_config(env) {
        return config.native_token;
    }
    env.storage()
        .instance()
        .get(&DataKey::NativeToken)
        .expect("native_token not set")
}

/// Sets the native XLM token contract address.
pub fn set_native_token(env: &Env, addr: &Address) {
    env.storage().instance().set(&DataKey::NativeToken, addr);
    update_runtime_config(env, |config| {
        config.native_token = addr.clone();
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// Pause state
// ──────────────────────────────────────────────────────────────────────────────

/// Returns `true` when the contract is paused.
pub fn is_paused(env: &Env) -> bool {
    if let Some(config) = get_runtime_config(env) {
        return config.paused;
    }
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

/// Returns the timestamp when the contract was paused, or None if not paused.
pub fn get_paused_at(env: &Env) -> Option<u64> {
    env.storage().instance().get(&ExtendedDataKey::PausedAt)
}

/// Sets the paused flag and tracks paused_at timestamp.
pub fn set_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
    update_runtime_config(env, |config| {
        config.paused = paused;
    });
    if paused {
        if get_paused_at(env).is_none() {
            env.storage()
                .instance()
                .set(&ExtendedDataKey::PausedAt, &env.ledger().timestamp());
        }
    } else {
        env.storage().instance().remove(&ExtendedDataKey::PausedAt);
    }
}

/// Storage migration state accessors
pub fn get_migration_state(env: &Env) -> Option<crate::types::MigrationState> {
    env.storage().instance().get(&ExtendedDataKey::MigrationState)
}

pub fn set_migration_state(env: &Env, state: &crate::types::MigrationState) {
    env.storage().instance().set(&ExtendedDataKey::MigrationState, state);
}

pub fn remove_migration_state(env: &Env) {
    env.storage().instance().remove(&ExtendedDataKey::MigrationState);
}

// ──────────────────────────────────────────────────────────────────────────────
// Minimum tip amount
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the minimum allowed tip amount in stroops.
pub fn get_min_tip_amount(env: &Env) -> i128 {
    if let Some(config) = get_runtime_config(env) {
        return config.min_tip_amount;
    }
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
    update_runtime_config(env, |config| {
        config.min_tip_amount = amount;
    });
}

pub const DEFAULT_MIN_WITHDRAWAL_AMOUNT: i128 = 1_000_000;

pub fn get_min_withdrawal_amount(env: &Env) -> i128 {
    env.storage().instance().get(&ExtendedDataKey::MinWithdrawalAmount).unwrap_or(DEFAULT_MIN_WITHDRAWAL_AMOUNT)
}

pub fn set_min_withdrawal_amount(env: &Env, amount: i128) {
    env.storage().instance().set(&ExtendedDataKey::MinWithdrawalAmount, &amount);
}

/// Default domain re-verification interval: 30 days.
pub const DEFAULT_DOMAIN_REVERIFICATION_INTERVAL: u64 = 2_592_000;

/// Returns the configured domain re-verification interval in seconds.
pub fn get_domain_reverification_interval(env: &Env) -> u64 {
    if let Some(config) = get_runtime_config(env) {
        if config.domain_reverify_secs > 0 {
            return config.domain_reverify_secs;
        }
    }
    DEFAULT_DOMAIN_REVERIFICATION_INTERVAL
}

/// Sets the domain re-verification interval in seconds (admin only).
pub fn set_domain_reverification_interval(env: &Env, interval_secs: u64) {
    update_runtime_config(env, |config| {
        config.domain_reverify_secs = interval_secs;
    });
}

/// Returns the effective minimum tip for a creator (custom override or global default).
pub fn get_effective_creator_min_tip(env: &Env, creator: &Address) -> i128 {
    if let Some(profile) = get_profile_opt(env, creator) {
        if let Some(custom) = profile.custom_min_tip {
            return custom;
        }
    }
    get_min_tip_amount(env)
}

/// Returns a creator's custom minimum tip override from their profile, if set.
pub fn get_creator_min_tip_override(env: &Env, creator: &Address) -> Option<i128> {
    get_profile_opt(env, creator).and_then(|p| p.custom_min_tip)
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
    if let Some(config) = get_runtime_config(env) {
        return config.admin;
    }
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("admin not set")
}

/// Overwrites the admin address.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
    update_runtime_config(env, |config| {
        config.admin = admin.clone();
    });
}

/// Pending admin change proposal, if any.
pub fn get_pending_admin_change(env: &Env) -> Option<crate::types::AdminChangeProposal> {
    env.storage().instance().get(&DataKey::PendingAdminChange)
}

pub fn set_pending_admin_change(env: &Env, proposal: &crate::types::AdminChangeProposal) {
    env.storage()
        .instance()
        .set(&DataKey::PendingAdminChange, proposal);
}

pub fn remove_pending_admin_change(env: &Env) {
    env.storage()
        .instance()
        .remove(&DataKey::PendingAdminChange);
}

// ──────────────────────────────────────────────────────────────────────────────
// Profile deactivation (separate from `Profile` blob for upgrade-safe reads)
// ──────────────────────────────────────────────────────────────────────────────

/// `true` when the creator profile is temporarily deactivated.
pub fn is_profile_deactivated(env: &Env, address: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&ExtendedDataKey::ProfileDeactivatedAt(address.clone()))
}

/// Ledger timestamp when the profile was deactivated, if deactivated.
pub fn get_profile_deactivated_at(env: &Env, address: &Address) -> Option<u64> {
    let key = ExtendedDataKey::ProfileDeactivatedAt(address.clone());
    let at = env.storage().persistent().get(&key);
    if at.is_some() {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    at
}

pub fn set_profile_deactivated_at(env: &Env, address: &Address, at: u64) {
    let key = ExtendedDataKey::ProfileDeactivatedAt(address.clone());
    env.storage().persistent().set(&key, &at);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
}

pub fn clear_profile_deactivation(env: &Env, address: &Address) {
    let key = ExtendedDataKey::ProfileDeactivatedAt(address.clone());
    if env.storage().persistent().has(&key) {
        env.storage().persistent().remove(&key);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Creator tip allowlist/blocklist
// ──────────────────────────────────────────────────────────────────────────────

pub fn is_creator_blocked_tipper(env: &Env, creator: &Address, tipper: &Address) -> bool {
    let key = ExtendedDataKey::CreatorBlockedTipper(creator.clone(), tipper.clone());
    let blocked = env.storage().persistent().has(&key);
    if blocked {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    blocked
}

pub fn get_creator_blocked_tipper_count(env: &Env, creator: &Address) -> u32 {
    let key = ExtendedDataKey::CreatorBlockedTipperCount(creator.clone());
    let count = env.storage().persistent().get(&key).unwrap_or(0_u32);
    if count > 0 {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    count
}

pub fn set_creator_blocked_tipper(env: &Env, creator: &Address, tipper: &Address, blocked_at: u64) {
    let entry_key = ExtendedDataKey::CreatorBlockedTipper(creator.clone(), tipper.clone());
    if !env.storage().persistent().has(&entry_key) {
        let count_key = ExtendedDataKey::CreatorBlockedTipperCount(creator.clone());
        let count = get_creator_blocked_tipper_count(env, creator);
        env.storage().persistent().set(&count_key, &(count + 1));
        extend_persistent_ttl(env, &count_key, PersistentTier::Standard);
    }
    env.storage().persistent().set(&entry_key, &blocked_at);
    extend_persistent_ttl(env, &entry_key, PersistentTier::Standard);
}

pub fn remove_creator_blocked_tipper(env: &Env, creator: &Address, tipper: &Address) {
    let entry_key = ExtendedDataKey::CreatorBlockedTipper(creator.clone(), tipper.clone());
    if env.storage().persistent().has(&entry_key) {
        env.storage().persistent().remove(&entry_key);
        let count_key = ExtendedDataKey::CreatorBlockedTipperCount(creator.clone());
        let count = get_creator_blocked_tipper_count(env, creator);
        env.storage()
            .persistent()
            .set(&count_key, &count.saturating_sub(1));
        extend_persistent_ttl(env, &count_key, PersistentTier::Standard);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin change history & Audit log
// ──────────────────────────────────────────────────────────────────────────────

/// Maximum capacity of the ring-buffered admin audit log.
pub const ADMIN_AUDIT_LOG_CAPACITY: u32 = 100;

pub fn load_admin_audit_log(env: &Env) -> soroban_sdk::Vec<crate::types::AdminAuditEntry> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::AdminAuditLog)
        .unwrap_or_else(|| soroban_sdk::Vec::new(env))
}

pub fn get_admin_audit_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::AdminAuditCount)
        .unwrap_or(0)
}

/// Append an admin audit entry to the ring-buffered log.
/// Wraps around by dropping the oldest entry when capacity is reached.
pub fn append_admin_audit_entry(
    env: &Env,
    actor: &Address,
    action_kind: Symbol,
    before_value: &String,
    after_value: &String,
) -> crate::types::AdminAuditEntry {
    let count = get_admin_audit_count(env);
    let next_id = count.saturating_add(1);

    let entry = crate::types::AdminAuditEntry {
        id: next_id,
        actor: actor.clone(),
        action_kind,
        before_value: before_value.clone(),
        after_value: after_value.clone(),
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    };

    let mut log = load_admin_audit_log(env);
    if log.len() >= ADMIN_AUDIT_LOG_CAPACITY {
        log.pop_front();
    }
    log.push_back(entry.clone());

    env.storage().instance().set(&ExtendedDataKey::AdminAuditLog, &log);
    env.storage().instance().set(&ExtendedDataKey::AdminAuditCount, &next_id);

    entry
}

fn load_admin_change_history(env: &Env) -> soroban_sdk::Vec<crate::types::AdminChangeHistoryEntry> {
    env.storage()
        .instance()
        .get(&DataKey::AdminChangeHistory)
        .unwrap_or(soroban_sdk::Vec::new(env))
}

pub fn get_admin_change_history_next_id(env: &Env) -> u32 {
    load_admin_change_history(env).len()
}

/// Append a completed admin change to history (sequential ids, newest has highest id).
pub fn append_admin_change_history(env: &Env, entry: &crate::types::AdminChangeHistoryEntry) {
    let mut history = load_admin_change_history(env);
    if history.len() >= ADMIN_AUDIT_LOG_CAPACITY {
        history.pop_front();
    }
    history.push_back(entry.clone());
    env.storage()
        .instance()
        .set(&DataKey::AdminChangeHistory, &history);
}

pub fn get_admin_change_history_entry(
    env: &Env,
    id: u32,
) -> Option<crate::types::AdminChangeHistoryEntry> {
    load_admin_change_history(env).get(id)
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
    if let Some(config) = get_runtime_config(env) {
        return config.fee_bps;
    }
    env.storage()
        .instance()
        .get(&DataKey::FeePercent)
        .unwrap_or(0)
}

/// Sets the withdrawal fee in basis points.
pub fn set_fee_bps(env: &Env, fee_bps: u32) {
    env.storage().instance().set(&DataKey::FeePercent, &fee_bps);
    update_runtime_config(env, |config| {
        config.fee_bps = fee_bps;
    });
}

/// Returns the configured minimum fee-change delay in ledgers.
pub fn get_fee_change_delay_ledgers(env: &Env) -> u32 {
    if let Some(config) = get_runtime_config(env) {
        return config.fee_change_delay_ledgers;
    }
    env.storage()
        .instance()
        .get(&symbol_short!("fee_delay"))
        .unwrap_or(crate::admin::DEFAULT_FEE_CHANGE_DELAY_LEDGERS)
}

/// Sets the configured minimum fee-change delay in ledgers.
pub fn set_fee_change_delay_ledgers(env: &Env, delay_ledgers: u32) {
    env.storage()
        .instance()
        .set(&symbol_short!("fee_delay"), &delay_ledgers);
    update_runtime_config(env, |config| {
        config.fee_change_delay_ledgers = delay_ledgers;
    });
}

/// Returns the pending fee change, if any.
pub fn get_pending_fee_change(env: &Env) -> Option<(u32, u32, u32, bool)> {
    env.storage()
        .instance()
        .get(&symbol_short!("fee_pend"))
}

/// Stores the pending fee change.
pub fn set_pending_fee_change(env: &Env, pending: &(u32, u32, u32, bool)) {
    env.storage()
        .instance()
        .set(&symbol_short!("fee_pend"), pending);
}

/// Clears the pending fee change.
pub fn clear_pending_fee_change(env: &Env) {
    env.storage().instance().remove(&symbol_short!("fee_pend"));
}

/// Returns the maximum active subscriptions per subscriber (default 50).
pub fn get_subscription_limit(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::SubscriptionLimit)
        .unwrap_or(50)
}

/// Sets the maximum active subscriptions per subscriber.
pub fn set_subscription_limit(env: &Env, limit: u32) {
    env.storage().instance().set(&DataKey::SubscriptionLimit, &limit);
}

/// Returns `true` if the reentrancy guard is currently active (a fund-moving
/// operation is in progress). Callers should not make external token transfers
/// while the guard is active.
pub fn is_reentrancy_guard_active(env: &Env) -> bool {
    env.storage().instance().get(&DataKey::ReentrancyGuard).unwrap_or(false)
}

/// Set the reentrancy guard to `locked` (beginning a fund-moving operation)
/// or `unlocked` (ending it).
pub fn set_reentrancy_guard(env: &Env, locked: bool) {
    env.storage().instance().set(&DataKey::ReentrancyGuard, &locked);
}

/// Guard helper: sets the guard to `locked`, runs `f`, then resets it to
/// `unlocked` regardless of whether `f` returns `Ok` or `Err`.
///
/// # Safety
/// Callers must ensure that `f` does not attempt any further cross-contract
/// calls that would be blocked by this guard (e.g. token transfers), as the
/// guard is purely a defense-in-depth measure.
pub fn with_reentrancy_guard_unlocked<'a, F, R>(env: &Env, f: F) -> R
where
    F: FnOnce() -> R,
{
    set_reentrancy_guard(env, true);
    let result = f();
    set_reentrancy_guard(env, false);
    result
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
    if let Some(config) = get_runtime_config(env) {
        return config.fee_collector;
    }
    env.storage()
        .instance()
        .get(&DataKey::FeeCollector)
        .expect("fee_collector not set")
}

/// Sets the fee collector address.
pub fn set_fee_collector(env: &Env, addr: &Address) {
    env.storage().instance().set(&DataKey::FeeCollector, addr);
    update_runtime_config(env, |config| {
        config.fee_collector = addr.clone();
    });
}

pub fn get_runtime_config(env: &Env) -> Option<RuntimeConfig> {
    env.storage().instance().get(&CacheKey::RuntimeConfig)
}

pub fn set_runtime_config(env: &Env, config: &RuntimeConfig) {
    env.storage()
        .instance()
        .set(&CacheKey::RuntimeConfig, config);
}

fn update_runtime_config<F>(env: &Env, update: F)
where
    F: FnOnce(&mut RuntimeConfig),
{
    if let Some(mut config) = get_runtime_config(env) {
        update(&mut config);
        set_runtime_config(env, &config);
    }
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
    let key = DataKey::Profile(address.clone());
    let profile = env
        .storage()
        .persistent()
        .get(&key)
        .expect("profile not found");
    extend_persistent_ttl(env, &key, PersistentTier::Balance);
    profile
}

/// Returns the profile for `address`, or `None` when absent.
pub fn get_profile_opt(env: &Env, address: &Address) -> Option<Profile> {
    let key = DataKey::Profile(address.clone());
    let profile = env.storage().persistent().get(&key);
    if profile.is_some() {
        extend_persistent_ttl(env, &key, PersistentTier::Balance);
    }
    profile
}

/// Persists (creates or updates) a profile, keyed by `profile.owner`.
pub fn set_profile(env: &Env, profile: &Profile) {
    let key = DataKey::Profile(profile.owner.clone());
    env.storage().persistent().set(&key, profile);
    extend_persistent_ttl(env, &key, PersistentTier::Balance);
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
    let key = DataKey::UsernameToAddress(username.clone());
    let addr = env.storage().persistent().get(&key);
    if addr.is_some() {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    addr
}

/// Stores the `username → address` reverse-lookup entry.
pub fn set_username_address(env: &Env, username: &String, address: &Address) {
    let key = DataKey::UsernameToAddress(username.clone());
    env.storage().persistent().set(&key, address);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
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
    if let Some(mut state) = get_send_tip_state(env) {
        state.tip_count = count + 1;
        set_send_tip_state(env, &state);
    }
    count
}

pub fn get_send_tip_state(env: &Env) -> Option<SendTipState> {
    env.storage().instance().get(&CacheKey::SendTipState)
}

pub fn set_send_tip_state(env: &Env, state: &SendTipState) {
    env.storage().instance().set(&CacheKey::SendTipState, state);
}

pub fn get_or_build_send_tip_state(env: &Env) -> SendTipState {
    get_send_tip_state(env).unwrap_or(SendTipState {
        tip_count: get_tip_count(env),
        total_tips_volume: get_total_tips_volume(env),
        stats_window_start: get_stats_window_start(env),
        tips_last_24h: get_tips_last_24h(env),
        volume_last_24h: get_volume_last_24h(env),
        active_creators_30d: get_active_creators_30d(env),
    })
}

pub fn apply_send_tip_state(env: &Env, state: &SendTipState) {
    set_send_tip_state(env, state);
    env.storage()
        .instance()
        .set(&DataKey::TipCount, &state.tip_count);
    env.storage()
        .instance()
        .set(&DataKey::TotalTipsVolume, &state.total_tips_volume);
    env.storage()
        .instance()
        .set(&DataKey::StatsWindowStart, &state.stats_window_start);
    env.storage()
        .instance()
        .set(&DataKey::TipsLast24h, &state.tips_last_24h);
    env.storage()
        .instance()
        .set(&DataKey::VolumeLast24h, &state.volume_last_24h);
    env.storage()
        .instance()
        .set(&DataKey::ActiveCreators30d, &state.active_creators_30d);
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
pub fn get_streak(
    env: &Env,
    supporter: &Address,
    creator: &Address,
) -> Option<crate::types::Streak> {
    let key = DataKey::Streak(supporter.clone(), creator.clone());
    let streak = env.storage().persistent().get(&key);
    if streak.is_some() {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    streak
}

/// Persist a streak record for a supporter/creator pair.
pub fn set_streak(env: &Env, streak: &crate::types::Streak) {
    let key = DataKey::Streak(streak.supporter.clone(), streak.creator.clone());
    env.storage().persistent().set(&key, streak);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
}

/// Return the total streak bonus accumulated for a creator.
///
/// Streak-bonus storage is intentionally disabled. Persisting it requires either
/// a new `DataKey` variant (increases contract footprint) or embedding a
/// `streak_bonus` field in `Profile` (requires a storage-schema migration). Both
/// options are deferred to the next planned contract upgrade. The three helpers
/// are kept as zero-cost stubs so existing call sites compile without change.
/// See PR #745 for the full deferral rationale.
pub fn get_creator_streak_bonus(_env: &Env, _creator: &Address) -> u32 {
    0
}

/// Add streak bonus points to a creator.
///
/// No-op until `streak_bonus` is introduced to `Profile` during a planned
/// storage-schema migration. See [`get_creator_streak_bonus`] for details.
pub fn add_creator_streak_bonus(_env: &Env, _creator: &Address, _bonus: u32) {}

/// Adjust a creator's streak bonus by a signed delta.
///
/// No-op until `streak_bonus` is introduced to `Profile` during a planned
/// storage-schema migration. See [`get_creator_streak_bonus`] for details.
pub fn adjust_creator_streak_bonus(_env: &Env, _creator: &Address, _delta: i32) {}

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
// Leaderboard (Multi-period)
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the leaderboard for a specific period.
pub fn get_leaderboard(env: &Env, period: LeaderboardPeriod) -> soroban_sdk::Vec<LeaderboardEntry> {
    if let Some(boards) = get_leaderboard_set(env) {
        return match period {
            LeaderboardPeriod::AllTime => boards.all_time,
            LeaderboardPeriod::Monthly => boards.monthly,
            LeaderboardPeriod::Weekly => boards.weekly,
        };
    }
    env.storage()
        .instance()
        .get(&DataKey::Leaderboard(period))
        .unwrap_or(soroban_sdk::Vec::new(env))
}

/// Sets the leaderboard for a specific period.
pub fn set_leaderboard(
    env: &Env,
    period: LeaderboardPeriod,
    leaderboard: &soroban_sdk::Vec<LeaderboardEntry>,
) {
    env.storage()
        .instance()
        .set(&DataKey::Leaderboard(period), leaderboard);
    let mut boards = get_leaderboard_set(env).unwrap_or_else(|| LeaderboardSet {
        all_time: get_legacy_leaderboard(env, LeaderboardPeriod::AllTime),
        monthly: get_legacy_leaderboard(env, LeaderboardPeriod::Monthly),
        weekly: get_legacy_leaderboard(env, LeaderboardPeriod::Weekly),
        monthly_reset_at: get_last_leaderboard_reset(env, LeaderboardPeriod::Monthly),
        weekly_reset_at: get_last_leaderboard_reset(env, LeaderboardPeriod::Weekly),
    });
    match period {
        LeaderboardPeriod::AllTime => boards.all_time = leaderboard.clone(),
        LeaderboardPeriod::Monthly => boards.monthly = leaderboard.clone(),
        LeaderboardPeriod::Weekly => boards.weekly = leaderboard.clone(),
    }
    set_leaderboard_set(env, &boards);
}

fn get_legacy_leaderboard(
    env: &Env,
    period: LeaderboardPeriod,
) -> soroban_sdk::Vec<LeaderboardEntry> {
    env.storage()
        .instance()
        .get(&DataKey::Leaderboard(period))
        .unwrap_or(soroban_sdk::Vec::new(env))
}

pub fn get_leaderboard_set(env: &Env) -> Option<LeaderboardSet> {
    env.storage().instance().get(&CacheKey::LeaderboardSet)
}

pub fn set_leaderboard_set(env: &Env, boards: &LeaderboardSet) {
    env.storage()
        .instance()
        .set(&CacheKey::LeaderboardSet, boards);
    env.storage().instance().set(
        &DataKey::Leaderboard(LeaderboardPeriod::AllTime),
        &boards.all_time,
    );
    env.storage().instance().set(
        &DataKey::Leaderboard(LeaderboardPeriod::Monthly),
        &boards.monthly,
    );
    env.storage().instance().set(
        &DataKey::Leaderboard(LeaderboardPeriod::Weekly),
        &boards.weekly,
    );
    env.storage().instance().set(
        &DataKey::LastLeaderboardReset(LeaderboardPeriod::Monthly),
        &boards.monthly_reset_at,
    );
    env.storage().instance().set(
        &DataKey::LastLeaderboardReset(LeaderboardPeriod::Weekly),
        &boards.weekly_reset_at,
    );
}

/// Returns the timestamp of the last reset for a specific period.
pub fn get_last_leaderboard_reset(env: &Env, period: LeaderboardPeriod) -> u64 {
    if let Some(boards) = get_leaderboard_set(env) {
        return match period {
            LeaderboardPeriod::AllTime => 0,
            LeaderboardPeriod::Monthly => boards.monthly_reset_at,
            LeaderboardPeriod::Weekly => boards.weekly_reset_at,
        };
    }
    env.storage()
        .instance()
        .get(&DataKey::LastLeaderboardReset(period))
        .unwrap_or(0)
}

/// Sets the timestamp of the last reset for a specific period.
pub fn set_last_leaderboard_reset(env: &Env, period: LeaderboardPeriod, at: u64) {
    env.storage()
        .instance()
        .set(&DataKey::LastLeaderboardReset(period), &at);
    if let Some(mut boards) = get_leaderboard_set(env) {
        match period {
            LeaderboardPeriod::AllTime => {}
            LeaderboardPeriod::Monthly => boards.monthly_reset_at = at,
            LeaderboardPeriod::Weekly => boards.weekly_reset_at = at,
        }
        set_leaderboard_set(env, &boards);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Rate Limiting
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the current rate limit configuration.
pub fn get_rate_limit_config(env: &Env) -> RateLimitConfig {
    if let Some(config) = get_runtime_config(env) {
        return config.rate_limit;
    }
    env.storage()
        .instance()
        .get(&DataKey::RateLimitConfig)
        .unwrap_or(RateLimitConfig {
            max_ops: 50,
            window_secs: 3600, // 1 hour default
        })
}

/// Sets the rate limit configuration.
pub fn set_rate_limit_config(env: &Env, config: &RateLimitConfig) {
    env.storage()
        .instance()
        .set(&DataKey::RateLimitConfig, config);
    update_runtime_config(env, |runtime_config| {
        runtime_config.rate_limit = config.clone();
    });
}

pub fn bump_existing_profile_ttl(env: &Env, address: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::Profile(address.clone()),
        PROFILE_TTL_MIN_LEDGERS,
        PROFILE_TTL_MAX_LEDGERS,
    );
}

/// Returns the current rate limit status for an address.
pub fn get_rate_limit_status(env: &Env, address: &Address) -> Option<RateLimitStatus> {
    env.storage()
        .instance()
        .get(&DataKey::RateLimit(address.clone()))
}

/// Sets the rate limit status for an address.
pub fn set_rate_limit_status(env: &Env, address: &Address, status: &RateLimitStatus) {
    env.storage()
        .instance()
        .set(&DataKey::RateLimit(address.clone()), status);
}

// ──────────────────────────────────────────────────────────────────────────────
// Period Volume Tracking
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the tip volume received by a creator during a specific period.
pub fn get_creator_period_volume(env: &Env, creator: &Address, period: LeaderboardPeriod) -> i128 {
    let start_at = get_last_leaderboard_reset(env, period);
    env.storage()
        .instance()
        .get(&DataKey::CreatorPeriodVolume(
            creator.clone(),
            period,
            start_at,
        ))
        .unwrap_or(0)
}

/// Adds `amount` to a creator's tip volume for a specific period.
pub fn add_creator_period_volume(
    env: &Env,
    creator: &Address,
    period: LeaderboardPeriod,
    amount: i128,
) -> i128 {
    let start_at = get_last_leaderboard_reset(env, period);
    let current = get_creator_period_volume(env, creator, period);
    let next = current.saturating_add(amount);
    env.storage().instance().set(
        &DataKey::CreatorPeriodVolume(creator.clone(), period, start_at),
        &next,
    );
    next
}

pub fn get_creator_period_volumes(env: &Env, creator: &Address) -> Option<CreatorPeriodVolumes> {
    env.storage()
        .instance()
        .get(&CacheKey::CreatorPeriodVolumes(creator.clone()))
}

pub fn set_creator_period_volumes(env: &Env, creator: &Address, volumes: &CreatorPeriodVolumes) {
    env.storage()
        .instance()
        .set(&CacheKey::CreatorPeriodVolumes(creator.clone()), volumes);
    env.storage().instance().set(
        &DataKey::CreatorPeriodVolume(
            creator.clone(),
            LeaderboardPeriod::Monthly,
            volumes.monthly_start_at,
        ),
        &volumes.monthly,
    );
    env.storage().instance().set(
        &DataKey::CreatorPeriodVolume(
            creator.clone(),
            LeaderboardPeriod::Weekly,
            volumes.weekly_start_at,
        ),
        &volumes.weekly,
    );
}

pub fn add_creator_period_volumes(
    env: &Env,
    creator: &Address,
    monthly_start_at: u64,
    weekly_start_at: u64,
    amount: i128,
) -> (i128, i128) {
    let mut volumes = get_creator_period_volumes(env, creator).unwrap_or(CreatorPeriodVolumes {
        monthly_start_at,
        monthly: 0,
        weekly_start_at,
        weekly: 0,
    });

    if volumes.monthly_start_at != monthly_start_at {
        volumes.monthly_start_at = monthly_start_at;
        volumes.monthly = 0;
    }
    if volumes.weekly_start_at != weekly_start_at {
        volumes.weekly_start_at = weekly_start_at;
        volumes.weekly = 0;
    }

    volumes.monthly = volumes.monthly.saturating_add(amount);
    volumes.weekly = volumes.weekly.saturating_add(amount);

    let monthly = volumes.monthly;
    let weekly = volumes.weekly;
    set_creator_period_volumes(env, creator, &volumes);
    (monthly, weekly)
}

/// Resets a creator's period volume (e.g. after a leaderboard reset).
/// Note: With timestamp-based keys, we don't strictly need this, but it can be used for cleanup.
pub fn reset_creator_period_volume(env: &Env, creator: &Address, period: LeaderboardPeriod) {
    let start_at = get_last_leaderboard_reset(env, period);
    env.storage()
        .instance()
        .remove(&DataKey::CreatorPeriodVolume(
            creator.clone(),
            period,
            start_at,
        ));
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
    if let Some(mut state) = get_send_tip_state(env) {
        state.total_tips_volume = next;
        set_send_tip_state(env, &state);
    }
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
// Refund storage functions
// ──────────────────────────────────────────────────────────────────────────────

/// Default refund configuration
pub const DEFAULT_REFUND_REQUEST_WINDOW_SECS: u64 = 86400; // 24 hours
pub const DEFAULT_REFUND_RESPONSE_WINDOW_SECS: u64 = 172800; // 48 hours
pub const DEFAULT_NON_REFUNDABLE_FEE_BPS: u32 = 200; // 2%

/// Get refund configuration
pub fn get_refund_config(env: &Env) -> crate::types::RefundConfig {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::RefundConfig)
        .unwrap_or(crate::types::RefundConfig {
            request_window_secs: DEFAULT_REFUND_REQUEST_WINDOW_SECS,
            response_window_secs: DEFAULT_REFUND_RESPONSE_WINDOW_SECS,
            non_refundable_fee_bps: DEFAULT_NON_REFUNDABLE_FEE_BPS,
            request_ttl_ledgers: 518400,
        })
}

/// Set refund configuration (admin only)
pub fn set_refund_config(env: &Env, config: &crate::types::RefundConfig) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::RefundConfig, config);
}

/// Get the number of pending refund requests tracked on chain.
pub fn get_pending_refund_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::PendingRefundCount)
        .unwrap_or(0)
}

/// Get the pending refund tip ID at a dense index.
pub fn get_pending_refund_tip_id(env: &Env, index: u32) -> Option<u32> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::PendingRefundTip(index))
}

/// Append a pending refund tip ID to the dense index.
pub fn add_pending_refund_tip_id(env: &Env, tip_id: u32) {
    let count = get_pending_refund_count(env);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::PendingRefundTip(count), &tip_id);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::PendingRefundCount, &(count + 1));
}

/// Remove a pending refund tip ID from the dense index using swap-remove.
pub fn remove_pending_refund_tip_id(env: &Env, tip_id: u32) {
    let count = get_pending_refund_count(env);
    if count == 0 {
        return;
    }

    let mut found_index: Option<u32> = None;
    for i in 0..count {
        if let Some(current_tip_id) = get_pending_refund_tip_id(env, i) {
            if current_tip_id == tip_id {
                found_index = Some(i);
                break;
            }
        }
    }

    let Some(index) = found_index else {
        return;
    };

    let last_index = count - 1;
    if index != last_index {
        if let Some(last_tip_id) = get_pending_refund_tip_id(env, last_index) {
            env.storage()
                .instance()
                .set(&ExtendedDataKey::PendingRefundTip(index), &last_tip_id);
        }
    }

    env.storage()
        .instance()
        .remove(&ExtendedDataKey::PendingRefundTip(last_index));
    env.storage()
        .instance()
        .set(&ExtendedDataKey::PendingRefundCount, &last_index);
}

/// Get refund request by tip ID
pub fn get_refund_request(env: &Env, tip_id: u32) -> Option<crate::types::RefundRequest> {
    env.storage()
        .temporary()
        .get(&ExtendedDataKey::RefundRequest(tip_id))
}

/// Set refund request
pub fn set_refund_request(env: &Env, request: &crate::types::RefundRequest) {
    let key = ExtendedDataKey::RefundRequest(request.tip_id);
    env.storage().temporary().set(&key, request);
    // Use same TTL as tips - we need to use a DataKey for TTL extension
    // Store in temporary with manual TTL
    env.storage()
        .temporary()
        .extend_ttl(&key, TIP_TTL_LEDGERS, TIP_TTL_LEDGERS);
}

/// Remove refund request
pub fn remove_refund_request(env: &Env, tip_id: u32) {
    env.storage()
        .temporary()
        .remove(&ExtendedDataKey::RefundRequest(tip_id));
}

/// Get the list of active subscriptions (subscriber, creator) pairs
pub fn get_active_subscriptions(env: &Env) -> soroban_sdk::Vec<(Address, Address)> {
    env.storage()
        .persistent()
        .get(&ExtendedDataKey::ActiveSubscriptions)
        .unwrap_or_else(|| soroban_sdk::Vec::new(env))
}

/// Add a subscription to the active subscriptions list
pub fn add_active_subscription(env: &Env, subscriber: &Address, creator: &Address) {
    let mut subs = get_active_subscriptions(env);
    subs.push_back((subscriber.clone(), creator.clone()));
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::ActiveSubscriptions, &subs);
}

/// Remove a subscription from the active subscriptions list
pub fn remove_active_subscription(env: &Env, subscriber: &Address, creator: &Address) {
    let mut subs = get_active_subscriptions(env);
    let mut new_subs = soroban_sdk::Vec::new(env);
    for (sub, crt) in subs.iter() {
        if !(sub == *subscriber && crt == *creator) {
            new_subs.push_back((sub, crt));
        }
    }
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::ActiveSubscriptions, &new_subs);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::storage::{Instance, Persistent, Temporary};
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

    // ── #1175 persistent TTL policy ────────────────────────────────────────────

    #[test]
    fn set_username_bumps_standard_ttl_on_write() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            let user = String::from_str(&env, "alice");
            let addr = Address::generate(&env);
            set_username_address(&env, &user, &addr);
            let key = DataKey::UsernameToAddress(user);
            assert_eq!(
                env.storage().persistent().get_ttl(&key),
                PERSISTENT_TTL_MAX_LEDGERS
            );
        });
    }

    #[test]
    fn get_username_bumps_standard_ttl_on_read() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            let user = String::from_str(&env, "bob");
            let addr = Address::generate(&env);
            let key = DataKey::UsernameToAddress(user.clone());
            // Seed the entry, then knock its TTL below the bump threshold.
            env.storage().persistent().set(&key, &addr);
            // A read must re-extend it back to the standard target.
            let _ = get_username_address(&env, &user);
            assert_eq!(
                env.storage().persistent().get_ttl(&key),
                PERSISTENT_TTL_MAX_LEDGERS
            );
        });
    }

    #[test]
    fn token_balance_bumps_balance_ttl_on_write_and_read() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            let creator = Address::generate(&env);
            let token = Address::generate(&env);
            set_token_balance(&env, &creator, &token, 100i128);
            let key = ExtendedDataKey::TokenBalance(creator.clone(), token.clone());
            // Balance-bearing entries get the longest TTL, on write …
            assert_eq!(
                env.storage().persistent().get_ttl(&key),
                BALANCE_TTL_MAX_LEDGERS
            );
            // … and on read.
            let _ = get_token_balance(&env, &creator, &token);
            assert_eq!(
                env.storage().persistent().get_ttl(&key),
                BALANCE_TTL_MAX_LEDGERS
            );
        });
    }

    #[test]
    fn balance_ttl_outlives_standard_ttl() {
        // The core funds-safety guarantee: a balance entry is always extended
        // at least as far out as any standard metadata entry.
        assert!(BALANCE_TTL_MAX_LEDGERS >= PERSISTENT_TTL_MAX_LEDGERS);
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
            verification: crate::types::VerificationStatus::default(),
            domain: String::from_str(&env, ""),
            domain_verified: false,
            domain_verified_at: None,
            custom_min_tip: None,
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
            verification: crate::types::VerificationStatus::default(),
            domain: String::from_str(&env, ""),
            domain_verified: false,
            domain_verified_at: None,
            custom_min_tip: None,
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
            verification: crate::types::VerificationStatus::default(),
            domain: String::from_str(&env, ""),
            domain_verified: false,
            domain_verified_at: None,
            custom_min_tip: None,
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

pub fn set_verification_request(
    env: &Env,
    address: &Address,
    verification_type: &crate::types::VerificationType,
) {
    let key = DataKey::VerificationRequest(address.clone());
    env.storage().persistent().set(&key, verification_type);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
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
    let key = DataKey::DonationPage(creator.clone());
    let page = env.storage().persistent().get(&key);
    if page.is_some() {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    page
}

pub fn set_donation_page(env: &Env, creator: &Address, config: &crate::types::DonationPageConfig) {
    let key = DataKey::DonationPage(creator.clone());
    env.storage().persistent().set(&key, config);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
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
    if let Some(mut state) = get_send_tip_state(env) {
        state.stats_window_start = timestamp;
        set_send_tip_state(env, &state);
    }
}

pub fn get_tips_last_24h(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TipsLast24h)
        .unwrap_or(0)
}

pub fn set_tips_last_24h(env: &Env, count: u32) {
    env.storage().instance().set(&DataKey::TipsLast24h, &count);
    if let Some(mut state) = get_send_tip_state(env) {
        state.tips_last_24h = count;
        set_send_tip_state(env, &state);
    }
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
    if let Some(mut state) = get_send_tip_state(env) {
        state.volume_last_24h = volume;
        set_send_tip_state(env, &state);
    }
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
    if let Some(mut state) = get_send_tip_state(env) {
        state.active_creators_30d = count;
        set_send_tip_state(env, &state);
    }
}

pub fn get_creator_last_active(env: &Env, creator: &Address) -> u64 {
    let key = DataKey::CreatorLastActive(creator.clone());
    let ts = env.storage().persistent().get(&key).unwrap_or(0);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
    ts
}

pub fn set_creator_last_active(env: &Env, creator: &Address, timestamp: u64) {
    let key = DataKey::CreatorLastActive(creator.clone());
    env.storage().persistent().set(&key, &timestamp);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
}

// ──────────────────────────────────────────────────────────────────────────────
// Goal storage functions
// ──────────────────────────────────────────────────────────────────────────────

pub fn get_active_goal(env: &Env, creator: &Address) -> Option<crate::types::Goal> {
    let key = ExtendedDataKey::ActiveGoal(creator.clone());
    let goal = env.storage().persistent().get(&key);
    if goal.is_some() {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    goal
}

pub fn set_active_goal(env: &Env, creator: &Address, goal: &crate::types::Goal) {
    let key = ExtendedDataKey::ActiveGoal(creator.clone());
    env.storage().persistent().set(&key, goal);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
}

pub fn get_archived_goals(env: &Env, creator: &Address) -> soroban_sdk::Vec<crate::types::Goal> {
    let key = ExtendedDataKey::ArchivedGoals(creator.clone());
    let goals = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(soroban_sdk::Vec::new(env));
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
    goals
}

pub fn set_archived_goals(
    env: &Env,
    creator: &Address,
    goals: &soroban_sdk::Vec<crate::types::Goal>,
) {
    let key = ExtendedDataKey::ArchivedGoals(creator.clone());
    env.storage().persistent().set(&key, goals);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
}

// ──────────────────────────────────────────────────────────────────────────────
// Multi-token storage functions
// ──────────────────────────────────────────────────────────────────────────────

pub fn get_accepted_token(env: &Env, token: &Address) -> Option<crate::types::AcceptedToken> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::AcceptedToken(token.clone()))
}

pub fn set_accepted_token(env: &Env, token: &Address, config: &crate::types::AcceptedToken) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::AcceptedToken(token.clone()), config);
}

pub fn get_accepted_token_list(env: &Env) -> soroban_sdk::Vec<Address> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::AcceptedTokenList)
        .unwrap_or(soroban_sdk::Vec::new(env))
}

pub fn set_accepted_token_list(env: &Env, tokens: &soroban_sdk::Vec<Address>) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::AcceptedTokenList, tokens);
}

pub fn get_token_balance(env: &Env, creator: &Address, token: &Address) -> i128 {
    let key = ExtendedDataKey::TokenBalance(creator.clone(), token.clone());
    let balance = env.storage().persistent().get(&key).unwrap_or(0);
    extend_persistent_ttl(env, &key, PersistentTier::Balance);
    balance
}

pub fn set_token_balance(env: &Env, creator: &Address, token: &Address, amount: i128) {
    let key = ExtendedDataKey::TokenBalance(creator.clone(), token.clone());
    env.storage().persistent().set(&key, &amount);
    extend_persistent_ttl(env, &key, PersistentTier::Balance);
}

pub fn add_token_balance(
    env: &Env,
    creator: &Address,
    token: &Address,
    amount: i128,
) -> Result<i128, ContractError> {
    let current = get_token_balance(env, creator, token);
    let new_balance = current
        .checked_add(amount)
        .ok_or(ContractError::OverflowError)?;
    set_token_balance(env, creator, token, new_balance);
    Ok(new_balance)
}

pub fn increment_scheduled_tip_count(env: &Env) -> u32 {
    let count: u32 = env
        .storage()
        .instance()
        .get(&ExtendedDataKey::ScheduledTipCount)
        .unwrap_or(0);
    let next = count + 1;
    env.storage()
        .instance()
        .set(&ExtendedDataKey::ScheduledTipCount, &next);
    next
}

pub fn get_scheduled_tip(env: &Env, id: u32) -> Option<crate::types::ScheduledTip> {
    env.storage()
        .persistent()
        .get(&ExtendedDataKey::ScheduledTip(id))
}

pub fn set_scheduled_tip(env: &Env, id: u32, tip: &crate::types::ScheduledTip) {
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::ScheduledTip(id), tip);
}

pub fn add_sender_scheduled_tip(env: &Env, sender: &Address, id: u32) {
    let count: u32 = env
        .storage()
        .persistent()
        .get(&ExtendedDataKey::SenderScheduledTipCount(sender.clone()))
        .unwrap_or(0);
    env.storage().persistent().set(
        &ExtendedDataKey::SenderScheduledTip(sender.clone(), count),
        &id,
    );
    env.storage().persistent().set(
        &ExtendedDataKey::SenderScheduledTipCount(sender.clone()),
        &(count + 1),
    );
}

pub fn add_creator_scheduled_tip(env: &Env, creator: &Address, id: u32) {
    let count: u32 = env
        .storage()
        .persistent()
        .get(&ExtendedDataKey::CreatorScheduledTipCount(
            creator.clone(),
        ))
        .unwrap_or(0);
    env.storage().persistent().set(
        &ExtendedDataKey::CreatorScheduledTip(creator.clone(), count),
        &id,
    );
    env.storage().persistent().set(
        &ExtendedDataKey::CreatorScheduledTipCount(creator.clone()),
        &(count + 1),
    );
}

pub fn get_sender_scheduled_tip_ids(env: &Env, sender: &Address) -> soroban_sdk::Vec<u32> {
    let count: u32 = env
        .storage()
        .persistent()
        .get(&ExtendedDataKey::SenderScheduledTipCount(sender.clone()))
        .unwrap_or(0);
    let mut vec = soroban_sdk::Vec::new(env);
    for i in 0..count {
        if let Some(id) = env.storage().persistent().get(
            &ExtendedDataKey::SenderScheduledTip(sender.clone(), i),
        ) {
            vec.push_back(id);
        }
    }
    vec
}

pub fn get_creator_scheduled_tip_ids(env: &Env, creator: &Address) -> soroban_sdk::Vec<u32> {
    let count: u32 = env
        .storage()
        .persistent()
        .get(&ExtendedDataKey::CreatorScheduledTipCount(
            creator.clone(),
        ))
        .unwrap_or(0);
    let mut vec = soroban_sdk::Vec::new(env);
    for i in 0..count {
        if let Some(id) = env.storage().persistent().get(
            &ExtendedDataKey::CreatorScheduledTip(creator.clone(), i),
        ) {
            vec.push_back(id);
        }
    }
    vec
}
