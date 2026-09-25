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
    ProfileInactive = 51,
    /// Storage limit exceeded for variable-size entry
    StorageLimitExceeded = 52,
}

impl ContractError {
    pub const AlreadyInitialized: Self = Self::AlreadyInit;
    pub const AdminChangeAlreadyPending: Self = Self::AdminChangePending;
    pub const AdminChangeTimelockNotMet: Self = Self::AdminTimelockNotMet;
    pub const InsufficientBalance: Self = Self::LowBalance;
    pub const ProfileDeactivated: Self = Self::Deactivated;
    pub const ProfileNotDeactivated: Self = Self::NotDeactivated;
    pub const BelowCreatorMinimum: Self = Self::BelowCreatorMin;
    pub const MaxProfilesReached: Self = Self::MaxProfiles;
    pub const RefundWindowExpired: Self = Self::RefundExpired;
    pub const RefundAlreadyRequested: Self = Self::RefundRequested;
    pub const RefundAlreadyProcessed: Self = Self::RefundProcessed;
    pub const BlocklistLimitReached: Self = Self::BlocklistLimit;
    pub const EmergencyWithdrawalNotAllowed: Self = Self::EmergencyNotAllowed;
    pub const AdminProposalExpired: Self = Self::ProposalExpired;
    pub const MigrationAlreadyCompleted: Self = Self::MigrationCompleted;
    pub const MigrationDowngradeRejected: Self = Self::MigrationDowngrade;
    pub const InvalidMigrationVersion: Self = Self::InvalidMigration;
    pub const SubscriptionLimitReached: Self = Self::SubLimitReached;
    pub const RefundRequestExpired: Self = Self::InvalidInput;
    pub const MultisigRequired: Self = Self::InvalidInput;
    pub const WdrBelowMin: Self = Self::ProposalExpired;
    pub const WithdrawalBelowMinimum: Self = Self::WdrBelowMin;
    pub const ProposalEpochMismatch: Self = Self::ProposalExpired;
}
