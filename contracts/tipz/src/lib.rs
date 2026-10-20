//! # Stellar Tipz Contract
//!
//! Decentralized tipping platform on Stellar (Soroban).
//!
//! ## Features
//! - Creator profile registration
//! - XLM tipping with optional messages
//! - Withdrawal with configurable fee (default 2%)
//! - Credit score based on X (Twitter) metrics
//! - On-chain leaderboard
//!
//! See docs/CONTRACT_SPEC.md for the full specification.

#![no_std]

#[cfg(any(test, feature = "testutils"))]
extern crate std;

pub mod admin;
pub mod circuit_breaker;
pub mod credit;
pub mod errors;
pub mod events;
pub mod fees;
pub mod goals;
pub mod leaderboard;
pub mod migrations;
pub mod multitoken;
pub mod multisig;
pub mod oracle;
pub mod profile;
pub mod refund;
pub mod stats;
pub mod storage;
pub mod streaks;
pub mod subscription;
pub mod tips;
pub mod token;
pub mod types;
pub mod validation;
pub mod verification;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

use crate::errors::ContractError;
use crate::types::{
    AdminAuditEntry, AdminChangeHistoryEntry, AdminChangeProposal, BatchSkip, ContractConfig,
    ContractStats, CreditBreakdown, CreditTier, LeaderboardEntry, MigrationState, Profile,
    ProfileWithDeactivation, Tip,
};

/// The current contract interface version, stored on-chain during initialization.
/// Must be incremented manually in source when the contract interface changes.
pub const CONTRACT_VERSION: u32 = 4;

#[contract]
pub struct TipzContract;

#[contractimpl]
impl TipzContract {
    include!("entrypoints/init.rs");
    include!("entrypoints/profile.rs");
    include!("entrypoints/tips.rs");
    include!("entrypoints/credit.rs");
    include!("entrypoints/leaderboard.rs");
    include!("entrypoints/admin.rs");
    include!("entrypoints/versioning.rs");
    include!("entrypoints/verification.rs");
    include!("entrypoints/subscription.rs");
    include!("entrypoints/multisig.rs");
    include!("entrypoints/donation.rs");
    include!("entrypoints/cleanup.rs");
    include!("entrypoints/stats.rs");
    include!("entrypoints/goals.rs");
    include!("entrypoints/multitoken.rs");
    include!("entrypoints/refund.rs");
}
