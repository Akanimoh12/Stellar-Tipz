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

mod admin;
mod credit;
mod errors;
mod events;
mod fees;
mod leaderboard;
mod profile;
mod storage;
mod tips;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

use crate::errors::ContractError;
use crate::types::{ContractStats, LeaderboardEntry, Profile};

#[contract]
pub struct TipzContract;

#[contractimpl]
impl TipzContract {
    // ──────────────────────────────────────────────
    // Initialization
    // ──────────────────────────────────────────────

    /// Initialize the contract with admin, fee collector, fee percentage, and native token address.
    /// Can only be called once.
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_collector: Address,
        fee_bps: u32,
        native_token: Address,
    ) -> Result<(), ContractError> {
        admin::initialize(&env, &admin, &fee_collector, fee_bps, &native_token)
    }

    // ──────────────────────────────────────────────
    // Profile Management
    // ──────────────────────────────────────────────

    /// Register a new creator profile.
    pub fn register_profile(
        env: Env,
        caller: Address,
        username: String,
        display_name: String,
        bio: String,
        image_url: String,
        x_handle: String,
    ) -> Result<Profile, ContractError> {
        profile::register_profile(
            &env,
            caller,
            username,
            display_name,
            bio,
            image_url,
            x_handle,
        )
    }

    /// Update an existing profile (owner only).
    pub fn update_profile(
        _env: Env,
        _caller: Address,
        _display_name: Option<String>,
        _bio: Option<String>,
        _image_url: Option<String>,
        _x_handle: Option<String>,
    ) -> Result<(), ContractError> {
        // TODO: Implement in issue #3 - Profile Update
        Err(ContractError::NotInitialized)
    }

    /// Update X (Twitter) metrics for a creator (admin only).
    pub fn update_x_metrics(
        _env: Env,
        _caller: Address,
        _target: Address,
        _followers: u32,
        _posts: u32,
        _replies: u32,
    ) -> Result<(), ContractError> {
        // TODO: Implement in issue #15 - X Metrics Update
        Err(ContractError::NotInitialized)
    }

    /// Get a profile by address.
    pub fn get_profile(_env: Env, _address: Address) -> Result<Profile, ContractError> {
        // TODO: Implement in issue #4 - Profile Queries
        Err(ContractError::NotInitialized)
    }

    /// Get a profile by username.
    pub fn get_profile_by_username(_env: Env, _username: String) -> Result<Profile, ContractError> {
        // TODO: Implement in issue #5 - Username Lookup
        Err(ContractError::NotInitialized)
    }

    // ──────────────────────────────────────────────
    // Tipping
    // ──────────────────────────────────────────────

    /// Send an XLM tip to a registered creator.
    pub fn send_tip(
        env: Env,
        tipper: Address,
        creator: Address,
        amount: i128,
        message: String,
    ) -> Result<(), ContractError> {
        tips::send_tip(&env, &tipper, &creator, amount, &message)
    }

    /// Withdraw accumulated tips (fee deducted).
    pub fn withdraw_tips(_env: Env, _caller: Address, _amount: i128) -> Result<(), ContractError> {
        // TODO: Implement in issue #10 - Withdraw Tips
        Err(ContractError::NotInitialized)
    }

    // ──────────────────────────────────────────────
    // Credit Score
    // ──────────────────────────────────────────────

    /// Calculate and return the credit score for a profile.
    pub fn calculate_credit_score(_env: Env, _address: Address) -> Result<u32, ContractError> {
        // TODO: Implement in issue #13 - Credit Score Calculation
        Err(ContractError::NotInitialized)
    }

    // ──────────────────────────────────────────────
    // Leaderboard
    // ──────────────────────────────────────────────

    /// Get the top creators by total tips received.
    pub fn get_leaderboard(_env: Env, _limit: u32) -> Result<Vec<LeaderboardEntry>, ContractError> {
        // TODO: Implement in issue #17 - Leaderboard
        Err(ContractError::NotInitialized)
    }

    // ──────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────

    /// Update the withdrawal fee (admin only).
    pub fn set_fee(_env: Env, _caller: Address, _fee_bps: u32) -> Result<(), ContractError> {
        // TODO: Implement in issue #20 - Admin Fee Management
        Err(ContractError::NotInitialized)
    }

    /// Update the fee collector address (admin only).
    pub fn set_fee_collector(
        _env: Env,
        _caller: Address,
        _new_collector: Address,
    ) -> Result<(), ContractError> {
        // TODO: Implement in issue #21 - Fee Collector Update
        Err(ContractError::NotInitialized)
    }

    /// Transfer admin role (admin only).
    pub fn set_admin(
        _env: Env,
        _caller: Address,
        _new_admin: Address,
    ) -> Result<(), ContractError> {
        // TODO: Implement in issue #22 - Admin Transfer
        Err(ContractError::NotInitialized)
    }

    /// Get global contract statistics.
    pub fn get_stats(_env: Env) -> Result<ContractStats, ContractError> {
        // TODO: Implement in issue #23 - Contract Stats
        Err(ContractError::NotInitialized)
    }
}
