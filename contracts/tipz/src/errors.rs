//! Custom error types for the Tipz contract.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    /// Contract has already been initialized
    AlreadyInitialized = 1,
    /// Contract has not been initialized yet
    NotInitialized = 2,
    /// Caller is not authorized to perform this action
    NotAuthorized = 3,
    /// Address already has a registered profile
    AlreadyRegistered = 4,
    /// Address does not have a registered profile
    NotRegistered = 5,
    /// Username is already taken by another profile
    UsernameTaken = 6,
    /// Username format is invalid (must be 3-32 chars, lowercase alphanumeric + underscore)
    InvalidUsername = 7,
    /// Display name is empty or exceeds 64 characters
    InvalidDisplayName = 8,
    /// Tip or withdrawal amount is invalid (must be > 0)
    InvalidAmount = 9,
    /// Insufficient balance for the requested withdrawal
    InsufficientBalance = 10,
    /// Cannot send a tip to your own profile
    CannotTipSelf = 11,
    /// Fee exceeds the maximum allowed (10%)
    InvalidFee = 12,
    /// Tip message exceeds 280 characters
    MessageTooLong = 13,
    /// Username not found in reverse lookup
    NotFound = 14,
    /// Arithmetic overflow during fee calculation
    OverflowError = 15,
    /// Image URL exceeds 256 characters
    InvalidImageUrl = 16,
    /// Batch update exceeds the maximum allowed entries (50)
    BatchTooLarge = 17,
    /// Contract is paused and state-changing operations are disabled
    ContractPaused = 18,
    /// Tip amount is below the configured minimum
    TipBelowMinimum = 19,
    /// Caller has non-zero balance and must withdraw tips before deregistering
    BalanceNotZero = 20,
    /// Invalid X metrics values (e.g. unreasonable follower/engagement counts)
    InvalidXMetrics = 21,
    /// Profile storage exists but the username→address mapping has expired (orphaned state)
    ProfileNotActive = 22,
    /// No pending admin proposal exists
    NoPendingAdmin = 23,
    /// Creator is already verified
    AlreadyVerified = 24,
    /// Creator is not verified
    NotVerified = 25,
    /// Caller is not the contract admin
    Unauthorized = 26,
    /// X handle is invalid (must be 1-16 chars, @?alphanumeric + underscore)
    InvalidXHandle = 27,
    /// Creator profile is deactivated and cannot receive tips
    ProfileDeactivated = 28,
    /// Profile is already deactivated
    AlreadyDeactivated = 29,
    /// Profile is not deactivated
    ProfileNotDeactivated = 30,
    /// Admin change cannot be confirmed until the timelock elapses
    AdminChangeTimelockNotMet = 31,
    /// A different admin change is already pending (cancel or wait before proposing another)
    AdminChangeAlreadyPending = 32,
}
