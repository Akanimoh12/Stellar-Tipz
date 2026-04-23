//! Data types for the Tipz contract.

use soroban_sdk::{contracttype, Address, String};

/// Verification type for creator profiles.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum VerificationType {
    Identity,
    SocialMedia,
    Community,
}

/// Verification status for a creator profile.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Default)]
pub struct VerificationStatus {
    /// Whether the creator is verified
    pub is_verified: bool,
    /// Verification type (if verified)
    pub verification_type: Option<VerificationType>,
    /// Timestamp when verification was granted
    pub verified_at: Option<u64>,
    /// Timestamp when verification was revoked (if applicable)
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
    /// Short bio (0-280 chars)
    pub bio: String,
    /// Profile image URL or IPFS CID (0-256 chars)
    pub image_url: String,
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

/// Individual tip record stored in temporary storage with a TTL of ~7 days.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Tip {
    /// Unique tip ID (monotonically increasing global counter)
    pub id: u32,
    /// Address that sent the tip
    pub tipper: Address,
    /// Address of the creator who received the tip
    pub creator: Address,
    /// Tip amount in stroops
    pub amount: i128,
    /// Optional message (0-280 chars)
    pub message: String,
    /// Ledger timestamp at the time the tip was sent
    pub timestamp: u64,
}

/// Leaderboard entry for top creators.
#[contracttype]
#[derive(Clone, Debug)]
pub struct LeaderboardEntry {
    /// Creator's address
    pub address: Address,
    /// Creator's username
    pub username: String,
    /// Lifetime tips received
    pub total_tips_received: i128,
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
