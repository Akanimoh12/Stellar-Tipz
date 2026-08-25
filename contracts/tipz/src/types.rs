//! Data types for the Tipz contract.

use soroban_sdk::{contracttype, Address, String, Symbol};

/// Maximum number of registered profiles to prevent storage DoS attacks.
pub const MAX_PROFILES: u32 = 10_000;

/// Maximum tip message length in characters.
pub const MAX_MESSAGE_LENGTH: u32 = 280;

/// Maximum number of blocked tippers a creator can keep on-chain.
pub const MAX_CREATOR_BLOCKED_TIPPERS: u32 = 100;

/// Maximum username length in characters.
pub const MAX_USERNAME_LENGTH: u32 = 32;

/// Maximum display name length in characters.
pub const MAX_DISPLAY_NAME_LENGTH: u32 = 64;

/// Maximum bio length in characters.
pub const MAX_BIO_LENGTH: u32 = 280;

/// Inactive profile threshold in seconds (180 days).
/// Profiles with no activity beyond this threshold may be cleaned up by the admin.
pub const INACTIVE_PROFILE_THRESHOLD_SECS: u64 = 180 * 24 * 3600;

/// Registration rate limit window in seconds (1 hour).
pub const REGISTRATION_RATE_WINDOW_SECS: u64 = 3600;

/// Maximum registrations per rate limit window.
pub const MAX_REGISTRATIONS_PER_WINDOW: u32 = 20;

/// Storage cost ceiling per operation in stroops (for analysis).
pub const STORAGE_COST_CEILING: i128 = 100_000_000;

/// Verification type for creator profiles.
///
/// `Unverified` is the default state — it replaces `Option::None` so that
/// `VerificationType` can be embedded directly in a `#[contracttype]` struct
/// without wrapping it in `Option` (which soroban-sdk does not support for
/// custom contracttype enums).
#[contracttype]
#[derive(Clone, Debug, PartialEq, Default)]
pub enum VerificationType {
    #[default]
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
#[derive(Clone, Debug, PartialEq, Default)]
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
    /// Domain claimed for stellar.toml verification (empty = not set)
    pub domain: String,
    /// Whether the domain ownership has been verified by admin
    pub domain_verified: bool,
    /// Timestamp when domain was last verified
    pub domain_verified_at: Option<u64>,
    /// Creator-specific minimum tip override in stroops (None = use global minimum)
    pub custom_min_tip: Option<i128>,
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
    /// Unix timestamp after which proposal expires.
    pub expires_at: u64,
}

/// State tracking for versioned storage migrations.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MigrationState {
    pub from_version: u32,
    pub target_version: u32,
    pub current_step: u32,
    pub processed_count: u32,
    pub is_completed: bool,
}

/// One recorded completed admin handoff (two-step confirm or direct `set_admin`).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AdminChangeHistoryEntry {
    pub old_admin: Address,
    pub new_admin: Address,
    pub confirmed_at: u64,
}

/// Recorded entry for an admin/privileged action in the ring-buffered audit trail.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AdminAuditEntry {
    /// Monotonically increasing audit log entry ID
    pub id: u32,
    /// Address of the actor performing the action
    pub actor: Address,
    /// Type of action performed
    pub action_kind: Symbol,
    /// Value before the action was taken
    pub before_value: String,
    /// Value after the action was taken
    pub after_value: String,
    /// Ledger sequence number at time of action
    pub ledger_sequence: u32,
    /// Ledger timestamp at time of action
    pub timestamp: u64,
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
    /// Optional message (0-280 chars) — may be encrypted
    pub message: String,
    /// Ledger timestamp at the time the tip was sent
    pub timestamp: u64,
    /// Whether this tip is anonymous
    pub is_anonymous: bool,
    /// Whether the message is encrypted so only the recipient can read it
    pub is_encrypted: bool,
}

/// Supporter/creator streak record.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Streak {
    /// Address of the supporter.
    pub supporter: Address,
    /// Address of the creator being tipped.
    pub creator: Address,
    /// Current consecutive streak count.
    pub current: u32,
    /// Longest streak observed for this pair.
    pub longest: u32,
    /// Day index of the last qualifying tip.
    pub last_tip_day: Option<u64>,
    /// Lifetime bonus points earned from this streak.
    pub bonus_points: u32,
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
    /// Weighted contribution from supporter streaks.
    pub streak_score: u32,
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
    /// Maximum active subscriptions per subscriber (default 50)
    pub subscription_limit: u32,
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

/// Withdrawal circuit breaker configuration.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CircuitBreakerConfig {
    /// Whether withdrawal volume tracking can auto-pause the contract.
    pub enabled: bool,
    /// Maximum gross withdrawal volume allowed in one rolling window.
    pub threshold: i128,
    /// Rolling window length in seconds.
    pub window_secs: u64,
    /// Fixed number of buckets used to approximate the rolling window.
    pub bucket_count: u32,
}

/// Withdrawal circuit breaker state.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CircuitBreakerStatus {
    /// Start timestamp for each active bucket.
    pub bucket_starts: soroban_sdk::Vec<u64>,
    /// Gross withdrawal volume stored in each bucket.
    pub bucket_volumes: soroban_sdk::Vec<i128>,
    /// True when the breaker was responsible for pausing the contract.
    pub tripped: bool,
    /// Timestamp when the breaker last tripped.
    pub tripped_at: Option<u64>,
}

/// Goal tracking for creators
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Goal {
    /// Creator address
    pub creator: Address,
    /// Target amount to raise
    pub target: i128,
    /// Amount raised so far
    pub raised: i128,
    /// Goal description (max 500 chars)
    pub description: String,
    /// Deadline timestamp (0 = no deadline)
    pub deadline: u64,
    /// Whether the goal is currently active
    pub active: bool,
    /// Timestamp when goal was created
    pub created_at: u64,
    /// Timestamp when goal was reached (None = not reached yet)
    pub reached_at: Option<u64>,
}

/// Accepted token configuration for multi-token tipping
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AcceptedToken {
    /// Token contract address
    pub token_address: Address,
    /// Oracle address for price conversion (optional)
    pub oracle_address: Option<Address>,
    /// Whether the token is currently enabled
    pub enabled: bool,
    /// Timestamp when token was added
    pub added_at: u64,
}

/// Token balance for a creator
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct TokenBalance {
    /// Token contract address
    pub token_address: Address,
    /// Balance amount
    pub amount: i128,
}

/// Scheduled tip for future delivery
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ScheduledTip {
    /// Unique scheduled tip ID
    pub id: u32,
    /// Address of the sender
    pub sender: Address,
    /// Address of the creator recipient
    pub creator: Address,
    /// Tip amount in stroops
    pub amount: i128,
    /// Optional message (0-280 chars)
    pub message: String,
    /// Timestamp when the tip should be delivered
    pub deliver_at: u64,
    /// Whether the tip has been delivered
    pub delivered: bool,
    /// Timestamp when the tip was actually delivered (None = not delivered)
    pub delivered_at: Option<u64>,
    /// Whether the tip has been cancelled
    pub cancelled: bool,
    /// Timestamp when the tip was cancelled (None = not cancelled)
    pub cancelled_at: Option<u64>,
    /// Timestamp when the scheduled tip was created
    pub created_at: u64,
}

/// Refund request status
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum RefundStatus {
    /// Refund has been requested and is pending creator response
    Pending,
    /// Creator approved the refund
    Approved,
    /// Creator rejected the refund
    Rejected,
    /// Refund was auto-approved after timeout
    AutoApproved,
}

/// Refund request for a tip
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RefundRequest {
    /// Tip ID being refunded
    pub tip_id: u32,
    /// Address of the tipper requesting refund
    pub tipper: Address,
    /// Address of the creator who received the tip
    pub creator: Address,
    /// Original tip amount
    pub amount: i128,
    /// Timestamp when refund was requested
    pub requested_at: u64,
    /// Current status of the refund
    pub status: RefundStatus,
    /// Timestamp when refund was processed (approved/rejected/auto-approved)
    pub processed_at: Option<u64>,
    /// Net refund amount (amount minus non-refundable fee)
    pub refund_amount: i128,
    /// Non-refundable platform fee
    pub non_refundable_fee: i128,
}

/// Refund configuration
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RefundConfig {
    /// Time window in seconds for requesting refunds (default 24 hours = 86400)
    pub request_window_secs: u64,
    /// Time window in seconds for creator to respond before auto-approval (default 48 hours = 172800)
    pub response_window_secs: u64,
    /// Non-refundable fee percentage in basis points (default 200 = 2%)
    pub non_refundable_fee_bps: u32,
    /// Time window in seconds for pending refund requests before auto-expiry (default 30 days = 2592000)
    pub request_ttl_ledgers: u32,
}
