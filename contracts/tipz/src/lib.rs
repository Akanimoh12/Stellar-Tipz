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
mod withdraw;

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
    pub fn withdraw_tips(env: Env, caller: Address, amount: i128) -> Result<(), ContractError> {
        tips::withdraw_tips(&env, &caller, amount)
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

        storage::extend_instance_ttl(&env);
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

    /// Get the top creators by total tips received, sorted descending.
    ///
    /// Returns at most `limit` entries.  Passing `limit = 0` returns all
    /// stored entries (up to 50).
    pub fn get_leaderboard(env: Env, limit: u32) -> Result<Vec<LeaderboardEntry>, ContractError> {
        Ok(leaderboard::get_leaderboard(&env, limit))
    }

    /// Return the 1-based rank of `address` on the leaderboard, or `None`
    /// when the address has not yet appeared in the top 50.
    pub fn get_leaderboard_rank(env: Env, address: Address) -> Option<u32> {
        leaderboard::get_leaderboard_rank(&env, &address)
    }

    /// Return the current number of entries on the leaderboard (0–50).
    pub fn get_leaderboard_size(env: Env) -> u32 {
        leaderboard::get_leaderboard_size(&env)
    }

    // ──────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────

    /// Update the withdrawal fee in basis points (max 1000 = 10 %). Admin only.
    ///
    /// Emits a `FeeUpdated` event with `(old_bps, new_bps)`.
    pub fn set_fee(env: Env, caller: Address, fee_bps: u32) -> Result<(), ContractError> {
        admin::set_fee(&env, &caller, fee_bps)
    }

    /// Update the fee collector address. Admin only.
    ///
    /// Emits a `FeeCollectorUpdated` event with the new collector address.
    pub fn set_fee_collector(
        env: Env,
        caller: Address,
        new_collector: Address,
    ) -> Result<(), ContractError> {
        admin::set_fee_collector(&env, &caller, &new_collector)
    }

    /// Transfer the admin role to a new address. Admin only.
    ///
    /// Emits an `AdminChanged` event with `(old_admin, new_admin)`.
    pub fn set_admin(env: Env, caller: Address, new_admin: Address) -> Result<(), ContractError> {
        admin::set_admin(&env, &caller, &new_admin)
    }

    /// Get global contract statistics.
    pub fn get_stats(env: Env) -> Result<ContractStats, ContractError> {
        if !storage::is_initialized(&env) {
            return Err(ContractError::NotInitialized);
        }
        Ok(ContractStats {
            total_creators: storage::get_total_creators(&env),
            total_tips_count: storage::get_tip_count(&env),
            total_tips_volume: storage::get_total_tips_volume(&env),
            total_fees_collected: storage::get_total_fees(&env),
            fee_bps: storage::get_fee_bps(&env),
        })
    }

    /// Extend the contract instance TTL manually (admin only).
    pub fn bump_ttl(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::bump_ttl(&env, &caller)
    }
}
