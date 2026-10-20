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
    CircuitBreakerConfig, CircuitBreakerStatus, LeaderboardEntry, LeaderboardPeriod, Profile,
    RateLimitConfig, RateLimitStatus,
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

/// Storage key enum for the hot path and frequently-used values.
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
}

/// Extended storage keys for additional state to keep the main key enum under the
/// Soroban contracttype size limit.
#[contracttype]
pub enum ExtendedDataKey {
    /// Global scheduled-tip counter.
    ScheduledTipCount,
    /// Optional scheduled tip by ID.
    ScheduledTip(u32),
    /// Scheduled tip IDs for a sender.
    SenderScheduledTip(Address, u32),
    /// Scheduled tip IDs for a creator.
    CreatorScheduledTip(Address, u32),
    /// Total scheduled tips for a sender.
    SenderScheduledTipCount(Address),
    /// Total scheduled tips for a creator.
    CreatorScheduledTipCount(Address),
    /// Pending two-step admin change proposal (full transition record).
    PendingAdminChange,
    /// Pending verification request by creator address
    VerificationRequest(Address),
    /// Subscription by (subscriber, creator)
    Subscription(Address, Address),
    /// Pending amount and interval, applied at the existing next_due boundary.
    SubscriptionChange(Address, Address),
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
    /// Cumulative tip volume from a specific sender to a specific creator (for leaderboard concentration cap).
    SenderCreatorVolume(Address, Address),
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
    /// Ledger sequence when a creator's credit score was last persisted (#1186).
    CreditComputedAtLedger(Address),
    /// Configurable staleness threshold in ledgers (#1186).
    CreditStalenessThreshold,
    /// Dense index: u32 → Address for paginated creator iteration (#1185).
    CreatorIndex(u32),
    /// Total entries in the dense creator index (#1185).
    CreatorIndexCount,
    /// Oracle contract address for a token (#1184).
    TokenOracleAddress(Address),
    /// Last known oracle price for a token (#1184).
    TokenOraclePrice(Address),
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
    /// Bitmask of paused operations (see `PauseFlag`).
    /// Global pause is represented by `PauseFlag::All`.
    pub pause_flags: u32,
    pub min_tip_amount: i128,
    pub rate_limit: RateLimitConfig,
    /// Domain re-verification interval in seconds (default 30 days)
    pub domain_reverify_secs: u64,
    /// Maximum sender contribution to a creator's leaderboard score in basis points (default 5000 = 50%).
    pub max_sender_contribution_bps: u32,
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

// Domain modules keep the storage API stable while making each concern independently readable.
mod config { use super::*; include!("storage_parts/config.rs"); }
mod profiles { use super::*; include!("storage_parts/profiles.rs"); }
mod tips { use super::*; include!("storage_parts/tips.rs"); }
mod leaderboard { use super::*; include!("storage_parts/leaderboard.rs"); }
mod accounting { use super::*; include!("storage_parts/accounting.rs"); }
mod auxiliary { use super::*; include!("storage_parts/auxiliary.rs"); }

pub use accounting::*;
pub use auxiliary::*;
pub use config::*;
pub use leaderboard::*;
pub use profiles::*;
pub use tips::*;

#[cfg(test)]
mod tests {
    use super::*;
    include!("storage_parts/tests.rs");
}
