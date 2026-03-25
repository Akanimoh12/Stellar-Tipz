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
mod token;
mod types;
mod validation;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

use crate::errors::ContractError;
use crate::types::{ContractStats, CreditTier, LeaderboardEntry, Profile, Tip};

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
        env: Env,
        caller: Address,
        display_name: Option<String>,
        bio: Option<String>,
        image_url: Option<String>,
        x_handle: Option<String>,
    ) -> Result<(), ContractError> {
        profile::update_profile(&env, caller, display_name, bio, image_url, x_handle)
    }

    /// Update X (Twitter) metrics for a creator (admin only).
    pub fn update_x_metrics(
        env: Env,
        caller: Address,
        creator: Address,
        x_followers: u32,
        x_engagement_avg: u32,
    ) -> Result<(), ContractError> {
        admin::update_x_metrics(&env, &caller, &creator, x_followers, x_engagement_avg)
    }

    /// Batch-update X metrics for multiple creators (admin only).
    ///
    /// At most 50 entries per call. Unregistered addresses are skipped (with a
    /// logged event) instead of failing the transaction.
    pub fn batch_update_x_metrics(
        env: Env,
        caller: Address,
        updates: Vec<(Address, u32, u32)>,
    ) -> Result<u32, ContractError> {
        admin::batch_update_x_metrics(&env, &caller, updates)
    }

    /// Get a profile by address.
    pub fn get_profile(env: Env, address: Address) -> Result<Profile, ContractError> {
        if !storage::has_profile(&env, &address) {
            return Err(ContractError::NotRegistered);
        }

        Ok(storage::get_profile(&env, &address))
    }

    /// Get a profile by username.
    pub fn get_profile_by_username(env: Env, username: String) -> Result<Profile, ContractError> {
        let address =
            storage::get_username_address(&env, &username).ok_or(ContractError::NotFound)?;
        Ok(storage::get_profile(&env, &address))
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

    /// Get a single tip record by its ID.
    ///
    /// Returns [`ContractError::NotFound`] when the tip does not exist or its
    /// temporary-storage TTL has expired (~7 days after the tip was sent).
    pub fn get_tip(env: Env, tip_id: u32) -> Result<Tip, ContractError> {
        tips::get_tip(&env, tip_id).ok_or(ContractError::NotFound)
    }

    /// Return up to `count` recent tips received by `creator`, newest first.
    ///
    /// Tips that have expired are silently omitted, so the returned vector may
    /// contain fewer than `count` entries.
    pub fn get_recent_tips(env: Env, creator: Address, count: u32) -> Vec<Tip> {
        tips::get_recent_tips(&env, &creator, count)
    }

    // ──────────────────────────────────────────────
    // Credit Score
    // ──────────────────────────────────────────────

    /// Calculate and return the credit score for a profile.
    pub fn calculate_credit_score(env: Env, address: Address) -> Result<u32, ContractError> {
        if !storage::has_profile(&env, &address) {
            return Err(ContractError::NotRegistered);
        }

        let mut profile = storage::get_profile(&env, &address);
        let score = credit::calculate_credit_score(&profile, env.ledger().timestamp());
        profile.credit_score = score;
        storage::set_profile(&env, &profile);

        Ok(score)
    }

    /// Return the current credit score and tier for a registered profile.
    ///
    /// The score (0–100) is derived from the profile's tip volume, X metrics,
    /// and account age.  Newly registered profiles start at **40** (Silver).
    ///
    /// # Errors
    /// Returns [`ContractError::NotRegistered`] when no profile exists for
    /// `address`.
    pub fn get_credit_tier(env: Env, address: Address) -> Result<(u32, CreditTier), ContractError> {
        credit::get_credit_tier(&env, &address)
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
