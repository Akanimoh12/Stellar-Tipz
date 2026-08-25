//! Error types for the Tipz contract.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAuthorized = 3,
    AdminChangeAlreadyPending = 4,
    AdminChangeTimelockNotMet = 5,
    NoPendingAdmin = 6,
    ContractPaused = 7,
    NotRegistered = 8,
    AlreadyRegistered = 9,
    UsernameTaken = 10,
    InvalidUsername = 11,
    InvalidDisplayName = 12,
    InvalidAmount = 13,
    InsufficientBalance = 14,
    BalanceNotZero = 15,
    OverflowError = 16,
    NotFound = 17,
    AlreadyDeactivated = 18,
    ProfileDeactivated = 19,
    ProfileNotDeactivated = 20,
    MessageTooLong = 21,
    InvalidImageUrl = 22,
    BatchTooLarge = 23,
    InvalidFee = 24,
    CannotTipSelf = 25,
    NotVerified = 26,
    AlreadyVerified = 27,
    Unauthorized = 28,
    RateLimitExceeded = 29,
    InvalidXHandle = 30,
    TipBelowMinimum = 31,
    ProfileNotActive = 32,
    /// Tip message contains invalid control characters
    InvalidMessage = 33,
    /// Tip amount is below the creator's custom minimum
    BelowCreatorMinimum = 34,
    /// Domain format is invalid or empty when required
    InvalidDomain = 35,
    /// Generic invalid input error
    InvalidInput = 36,
    /// Token is not in the accepted whitelist
    TokenNotAccepted = 37,
    /// Maximum number of registered profiles reached (DoS protection)
    MaxProfilesReached = 38,
    /// Profile is inactive beyond the cleanup threshold
    ProfileInactive = 39,
    /// Refund request window has expired
    RefundWindowExpired = 46,
    /// Refund has already been requested for this tip
    RefundAlreadyRequested = 47,
    /// Refund has already been processed
    RefundAlreadyProcessed = 48,
    /// No refund request exists for this tip
    NoRefundRequest = 49,
    /// Only the tipper can request a refund
    NotTipper = 50,
    /// Only the creator can approve/reject a refund
    NotCreator = 51,
    /// Tipper is blocked by the creator
    TipperBlocked = 52,
    /// Creator blocklist reached its configured cap
    BlocklistLimitReached = 53,
}
