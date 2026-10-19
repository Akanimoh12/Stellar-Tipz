use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    NotInitialized = 1,
    AlreadyInit = 2,
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
    LowBalance = 14,
    BalanceNotZero = 15,
    OverflowError = 16,
    NotFound = 17,
    Deactivated = 18,
    NotDeactivated = 19,
    MessageTooLong = 20,
    InvalidImageUrl = 21,
    BatchTooLarge = 22,
    InvalidFee = 23,
    CannotTipSelf = 24,
    NotVerified = 25,
    AlreadyVerified = 26,
    RateLimitExceeded = 27,
    TipBelowMinimum = 28,
    BelowCreatorMin = 29,
    InvalidDomain = 30,
    InvalidInput = 31,
    TokenNotAccepted = 32,
    MaxProfiles = 33,
    RefundExpired = 34,
    RefundRequested = 35,
    RefundProcessed = 36,
    NotTipper = 37,
    NotCreator = 38,
    TipperBlocked = 39,
    BlocklistLimit = 40,
    ContractNotPaused = 41,
    EmergencyNotAllowed = 42,
    ProposalExpired = 43,
    MigrationCompleted = 44,
    MigrationDowngrade = 45,
    InvalidMigration = 46,
    NoRefundRequest = 47,
    InvalidMessage = 48,
    SubLimitReached = 49,
    RefundReqExpired = 50,
    /// Profile is inactive beyond the cleanup threshold
    ProfileInactive = 39,
    /// Refund request window has expired
    RefundWindowExpired = 40,
    /// Refund has already been requested for this tip
    RefundAlreadyRequested = 41,
    /// Refund has already been processed
    RefundAlreadyProcessed = 42,
    /// No refund request exists for this tip
    NoRefundRequest = 43,
    /// Only the tipper can request a refund
    NotTipper = 44,
    /// Only the creator can approve/reject a refund
    NotCreator = 45,
}
