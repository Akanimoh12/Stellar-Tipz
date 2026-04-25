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
}