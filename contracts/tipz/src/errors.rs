use soroban_sdk::contracterror;

/// Contract error codes.
///
/// Every variant has a unique discriminant and a unique name. The discriminant is the
/// on-chain error code, so existing codes must never be reused for a different meaning.
/// Frontend messages for each variant live in `frontend-scaffold/src/helpers/error.ts`
/// (`CONTRACT_ERROR_CODES`) and are kept in sync by a test that parses this file.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAuthorized = 3,
    AdminChangePending = 4,
    AdminTimelockNotMet = 5,
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
    ProfileDeactivated = 18,
    ProfileNotDeactivated = 19,
    MessageTooLong = 20,
    InvalidImageUrl = 21,
    BatchTooLarge = 22,
    InvalidFee = 23,
    CannotTipSelf = 24,
    NotVerified = 25,
    AlreadyVerified = 26,
    RateLimitExceeded = 27,
    TipBelowMinimum = 28,
    BelowCreatorMinimum = 29,
    InvalidDomain = 30,
    /// Generic invalid input error
    InvalidInput = 31,
    /// Token is not in the accepted whitelist
    TokenNotAccepted = 32,
    /// Maximum number of registered profiles reached (DoS protection)
    MaxProfilesReached = 33,
    /// Refund request window has expired
    RefundWindowExpired = 34,
    /// Refund has already been requested for this tip
    RefundAlreadyRequested = 35,
    /// Refund has already been processed
    RefundAlreadyProcessed = 36,
    /// Only the tipper can request a refund
    NotTipper = 37,
    /// Only the creator can approve/reject a refund
    NotCreator = 38,
    /// A creator has blocked this tipper
    TipperBlocked = 39,
    BlocklistLimitReached = 40,
    ContractNotPaused = 41,
    EmergencyNotAllowed = 42,
    ProposalExpired = 43,
    MigrationCompleted = 44,
    MigrationDowngradeRejected = 45,
    InvalidMigrationVersion = 46,
    /// No refund request exists for this tip
    NoRefundRequest = 47,
    /// Tip message contains invalid control characters
    InvalidMessage = 48,
    SubscriptionLimitReached = 49,
    /// Refund request window for pending refunds has expired
    RefundRequestExpired = 50,
    /// Profile is inactive beyond the cleanup threshold
    ProfileInactive = 51,
    /// Admin change proposal has expired before confirmation
    AdminProposalExpired = 52,
    /// Emergency withdrawal is not permitted in the current state
    EmergencyWithdrawalNotAllowed = 53,
    /// Caller is not authorized for this admin-only operation
    Unauthorized = 54,
    /// Withdrawal amount is below the configured minimum
    WdrBelowMin = 55,
    /// Operation must go through the multisig flow
    MultisigRequired = 56,
    /// Configuration values are inconsistent with each other
    ConfigMismatch = 57,
    /// Multisig proposal was created under a different epoch
    ProposalEpochMismatch = 58,
    /// Per-address or global storage limit reached
    StorageLimitExceeded = 59,
    /// Token did not credit exactly the tipped amount (fee-on-transfer or rebasing token)
    NonStandardToken = 60,
}
