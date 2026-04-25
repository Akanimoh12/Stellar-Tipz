//! Data types for the Tipz contract.

use soroban_sdk::{contracttype, Address, String};

/// Verification type for creator profiles.
///
/// `Unverified` is the default state — it replaces `Option::None` so that
/// `VerificationType` can be embedded directly in a `#[contracttype]` struct
/// without wrapping it in `Option` (which soroban-sdk does not support for
/// custom contracttype enums).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum VerificationType {
    Unverified,
    Identity,
    SocialMedia,
    Community,
}

/// Period for leaderboard tracking.
#[contracttype]
#[derive(Clone, Debug, Copy, PartialEq, Eq)]
pub enum LeaderboardPeriod {
    AllTime,
    Monthly,
    Weekly,
}

/// Verification status for a creator profile.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct VerificationStatus {
    /// Whether the creator is verified
    pub is_verified: bool,
    /// Verification type (Unverified when not yet verified)
    pub verification_type: VerificationType,
    /// Timestamp when verification was granted (0 = not set)
    pub verified_at: Option<u64>,
    /// Timestamp when verification was revoked (0 = not revoked)
    pub revoked_at: Option<u64>,
}

/// Creator profile stored on-chain.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Profile {
    /// Stellar address of the creator
    pub owner: Address,
    /// Unique username (lowercase, alphanumeric + underscore, 3-32 chars)
    pub username: String,
    /// Display name (1-64 chars)
    pub display_name: String,
    /// Short bio (0-500 chars)
    pub bio: String,
    /// Website URL (0-200 chars)
    pub website: String,
    /// Profile image URL or IPFS CID (0-256 chars)
    pub image_url: String,
    /// Map of social platforms to handles (max 5 links)
    pub social_links: soroban_sdk::Map<soroban_sdk::Symbol, String>,
    /// X (Twitter) handle (0-32 chars)
    pub x_handle: String,
    /// X follower count (set by admin)
    pub x_followers: u32,
    /// Average X engagement per post (set by admin)
    pub x_engagement_avg: u32,
    /// Credit score (0-100)
    pub credit_score: u32,
    /// Lifetime tips received (in stroops)
    pub total_tips_received: i128,
    /// Number of tips received
    pub total_tips_count: u32,
    /// Current withdrawable balance (in stroops)
    pub balance: i128,
    /// Ledger timestamp of registration
    pub registered_at: u64,
    /// Last profile update timestamp
    pub updated_at: u64,
    /// Verification status
    pub verification: VerificationStatus,
}

/// Profile plus deactivation state for queries (`get_profile`, `get_profile_by_username`).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ProfileWithDeactivation {
    pub profile: Profile,
    pub is_deactivated: bool,
    /// Set when the profile is deactivated (hidden from leaderboard, tips disabled).
    pub deactivated_at: Option<u64>,
}

/// Pending time-locked admin rotation (see `ADMIN_CHANGE_TIMELOCK_SECS`).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AdminChangeProposal {
    pub new_admin: Address,
    /// Unix timestamp after which `confirm_admin_change` may succeed.
    pub confirmable_after: u64,
}

/// One recorded completed admin handoff (two-step confirm or direct `set_admin`).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AdminChangeHistoryEntry {
    pub old_admin: Address,
    pub new_admin: Address,
    pub confirmed_at: u64,
}

/// Recurring tip subscription record.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Subscription {
    /// Address of the supporter
    pub subscriber: Address,
    /// Address of the creator
    pub creator: Address,
    /// Amount to tip per interval
    pub amount: i128,
    /// Interval in days
    pub interval_days: u32,
    /// Timestamp of next execution
    pub next_due: u64,
    /// Whether the subscription is currently active
    pub active: bool,
}

/// Pending withdrawal for security cooldown.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PendingWithdrawal {
    /// Unique withdrawal ID
    pub id: u32,
    /// Creator address
    pub creator: Address,
    /// Amount to withdraw
    pub amount: i128,
    /// Execution timestamp (after cooldown)
    pub unlock_at: u64,
}

/// Individual tip record stored in temporary storage with a TTL of ~7 days.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Tip {
    /// Unique tip ID (monotonically increasing global counter)
    pub id: u32,
    /// Address that actually sent the funds
    pub sender: Address,
    /// Address that gets the credit (on behalf of). Same as sender for normal tips.
    pub benefactor: Option<Address>,
    /// Address of the creator who received the tip
    pub creator: Address,
    /// Tip amount in stroops
    pub amount: i128,
    /// Optional message (0-280 chars)
    pub message: String,
    /// Ledger timestamp at the time the tip was sent
    pub timestamp: u64,
    /// Whether this tip is anonymous
    pub is_anonymous: bool,
}

/// Leaderboard entry for top creators.
#[contracttype]
#[derive(Clone, Debug)]
pub struct LeaderboardEntry {
    /// Creator's address
    pub address: Address,
    /// Creator's username
    pub username: String,
    /// Tips received during the period
    pub amount: i128,
    /// Current credit score
    pub credit_score: u32,
}

/// Credit tier derived from a creator's on-chain credit score (0–100).
///
/// | Tier    | Score range | Description                         |
/// |---------|-------------|-------------------------------------|
/// | New     | 0 – 19      | No activity yet                     |
/// | Bronze  | 20 – 39     | Early-stage creator                 |
/// | Silver  | 40 – 59     | Default for newly registered profiles|
/// | Gold    | 60 – 79     | Established creator                  |
/// | Diamond | 80 – 100    | Elite creator                        |
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum CreditTier {
    New,
    Bronze,
    Silver,
    Gold,
    Diamond,
}

/// Component-level breakdown of a profile credit score.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CreditBreakdown {
    /// Fixed score every registered profile receives.
    pub base: u32,
    /// Weighted contribution from lifetime tips.
    pub tip_score: u32,
    /// Weighted contribution from X metrics.
    pub x_score: u32,
    /// Weighted contribution from account age.
    pub age_score: u32,
    /// Final score after summing all components (capped at 100).
    pub total: u32,
}

/// A single skipped entry from a batch X-metrics update, including the reason.
///
/// | `reason` | Meaning                       |
/// |----------|-------------------------------|
/// | `0`      | Address is not registered     |
/// | `1`      | Metric values failed validation |
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct BatchSkip {
    /// The address that was skipped
    pub address: Address,
    /// Reason code: 0 = not registered, 1 = invalid metrics
    pub reason: u32,
}

/// Global contract statistics.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ContractStats {
    /// Total registered creators
    pub total_creators: u32,
    /// Total tips sent (count)
    pub total_tips_count: u32,
    /// Total tip volume in stroops
    pub total_tips_volume: i128,
    /// Total fees collected in stroops
    pub total_fees_collected: i128,
    /// Current fee in basis points
    pub fee_bps: u32,
}

/// Full contract configuration (superset of ContractStats).
/// Returns all admin-readable configuration in a single call.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ContractConfig {
    /// Contract admin address
    pub admin: Address,
    /// Address that receives fees
    pub fee_collector: Address,
    /// Withdrawal fee in basis points
    pub fee_bps: u32,
    /// Native XLM token contract address (SAC)
    pub native_token: Address,
    /// Total registered creators
    pub total_creators: u32,
    /// Total tips sent (count)
    pub total_tips_count: u32,
    /// Total tip volume in stroops
    pub total_tips_volume: i128,
    /// Total fees collected in stroops
    pub total_fees_collected: i128,
    /// Flag indicating contract is initialized
    pub is_initialized: bool,
    /// On-chain contract version
    pub version: u32,
}

/// Donation page configuration for a creator
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct DonationPageConfig {
    /// Custom welcome message (0-500 chars)
    pub welcome_message: String,
    /// Suggested tip amounts (up to 6 presets)
    pub suggested_amounts: soroban_sdk::Vec<i128>,
    /// Theme color (hex format, e.g., "#ff6b6b")
    pub theme_color: String,
    /// Header image URI (IPFS CID or URL, 0-256 chars)
    pub header_image_uri: String,
    /// Whether this is the default config
    pub is_default: bool,
}

/// Rate limit configuration for the contract.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RateLimitConfig {
    /// Max operations per window
    pub max_ops: u32,
    /// Window duration in seconds (e.g., 3600 for 1 hour)
    pub window_secs: u64,
}

/// Rate limit tracking for an address.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RateLimitStatus {
    /// Number of operations performed in the current window
    pub count: u32,
    /// Timestamp when the current window started
    pub last_op_time: u64,
}
