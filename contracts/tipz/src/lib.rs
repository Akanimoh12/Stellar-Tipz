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
mod multisig;
mod profile;
mod stats;
mod storage;
mod subscription;
mod streaks;
mod tips;
mod token;
mod types;
mod validation;
mod verification;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

use crate::errors::ContractError;
use crate::types::{
    BatchSkip, ContractConfig, ContractStats, CreditBreakdown, CreditTier, LeaderboardEntry,
    Profile, Tip,
};

/// The current contract interface version, stored on-chain during initialization.
/// Must be incremented manually in source when the contract interface changes.
pub const CONTRACT_VERSION: u32 = 1;

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

    /// Deregister the caller's profile, permanently removing it from the platform.
    ///
    /// # Requirements
    /// - Caller must have a registered profile
    /// - Caller's balance must be zero (all tips withdrawn)
    /// - Contract must not be paused
    ///
    /// # Effects
    /// - Removes profile from persistent storage
    /// - Removes username reverse-lookup entry
    /// - Removes creator from leaderboard (if present)
    /// - Decrements total creators counter
    /// - Resets per-creator and per-tipper tip index entries in temporary storage
    ///   (prevents index collisions on re-registration)
    /// - Emits ProfileDeregistered event
    ///
    /// # Errors
    /// - [`ContractError::NotRegistered`] - Caller has no profile
    /// - [`ContractError::BalanceNotZero`] - Caller has unwithdrawn tips
    /// - [`ContractError::ContractPaused`] - Contract is paused
    pub fn deregister_profile(env: Env, caller: Address) -> Result<(), ContractError> {
        profile::deregister_profile(&env, caller)
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
    /// At most 50 entries per call. Entries are skipped when the address is
    /// not registered (reason 0) or metric values are out of bounds (reason 1).
    /// A per-entry `batch_skipped` event is emitted for each skip.
    /// Returns a `Vec<BatchSkip>` describing each skipped entry and why.
    ///
    /// Emits an `XMetricsBatchCompleted` event with processed count, skipped
    /// count, and the full list of skipped entries.
    pub fn batch_update_x_metrics(
        env: Env,
        caller: Address,
        updates: Vec<(Address, u32, u32)>,
    ) -> Result<Vec<BatchSkip>, ContractError> {
        admin::batch_update_x_metrics(&env, &caller, updates)
    }

    /// Preview which entries would be skipped by `batch_update_x_metrics`
    /// without modifying any on-chain state (dry-run mode). Admin only.
    /// Returns a `Vec<BatchSkip>` with skip reasons (0 = not registered,
    /// 1 = invalid metrics).
    pub fn batch_update_x_metrics_preview(
        env: Env,
        caller: Address,
        updates: Vec<(Address, u32, u32)>,
    ) -> Result<Vec<BatchSkip>, ContractError> {
        admin::batch_update_x_metrics_preview(&env, &caller, updates)
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
        // Guard against orphaned state: Profile exists but UsernameToAddress expired (or vice versa).
        if !storage::is_profile_active(&env, &address) {
            return Err(ContractError::NotFound);
        }
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
        is_anonymous: bool,
    ) -> Result<(), ContractError> {
        tips::send_tip(&env, &tipper, &creator, amount, &message, is_anonymous)
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

    /// Return up to `limit` recent tips received by `creator`, newest first.
    ///
    /// - `limit` is capped at 50 per call.
    /// - `offset`: number of tips to skip from the most recent (0 = start
    ///   from latest). Use `get_creator_tip_count` to know the total for
    ///   frontend pagination.
    /// - Expired tips are silently omitted, so the result may contain fewer
    ///   than `limit` entries.
    pub fn get_recent_tips(env: Env, creator: Address, limit: u32, offset: u32) -> Vec<Tip> {
        tips::get_recent_tips(&env, &creator, limit, offset)
    }

    /// Return the number of tips received by `creator` (within the ~7-day
    /// TTL window tracked in temporary storage). Useful for frontend
    /// pagination with `get_recent_tips`.
    pub fn get_creator_tip_count(env: Env, creator: Address) -> u32 {
        storage::get_creator_tip_count(&env, &creator)
    }

    /// Return the total number of tips ever sent (monotonically increasing).
    ///
    /// This counter lives in instance storage and never expires, unlike
    /// individual tip records which have a ~7-day TTL. Use this together with
    /// `TipSent` events to reconstruct full tip history via an off-chain
    /// indexer.
    pub fn get_tip_count(env: Env) -> u32 {
        storage::get_tip_count(&env)
    }

    /// Return up to `limit` recent tips sent by `tipper`, newest first.
    ///
    /// Expired tips are silently omitted, so the returned vector may contain
    /// fewer than `limit` entries.
    pub fn get_tips_by_tipper(env: Env, tipper: Address, limit: u32) -> Vec<Tip> {
        tips::get_tips_by_tipper(&env, &tipper, limit)
    }

    /// Return the number of tips sent by `tipper` (within the ~7-day TTL
    /// window tracked in temporary storage).
    pub fn get_tipper_tip_count(env: Env, tipper: Address) -> u32 {
        storage::get_tipper_tip_count(&env, &tipper)
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
        let score =
            credit::calculate_credit_score_with_streak(&env, &profile, env.ledger().timestamp());
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

    /// Return the weighted credit score breakdown for a registered profile.
    pub fn get_credit_breakdown(
        env: Env,
        address: Address,
    ) -> Result<CreditBreakdown, ContractError> {
        credit::get_credit_breakdown(&env, &address)
    }

    /// Return the current supporter streak for a `(supporter, creator)` pair.
    pub fn get_streak(
        env: Env,
        supporter: Address,
        creator: Address,
    ) -> Result<crate::types::Streak, ContractError> {
        if !storage::has_profile(&env, &creator) {
            return Err(ContractError::NotRegistered);
        }

        Ok(streaks::get_streak(&env, &supporter, &creator))
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

    /// Transfer the admin role directly to a new address. Admin only.
    ///
    /// For a safer two-step transfer use `propose_admin` + `accept_admin`.
    pub fn set_admin(env: Env, caller: Address, new_admin: Address) -> Result<(), ContractError> {
        admin::set_admin(&env, &caller, &new_admin)
    }

    /// Propose a new admin (current admin only). Step 1 of two-step admin transfer.
    pub fn propose_admin(
        env: Env,
        caller: Address,
        new_admin: Address,
    ) -> Result<(), ContractError> {
        admin::propose_admin(&env, &caller, &new_admin)
    }

    /// Accept the pending admin proposal (proposed admin only). Step 2 of two-step admin transfer.
    pub fn accept_admin(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::accept_admin(&env, &caller)
    }

    /// Cancel a pending admin proposal (current admin only).
    pub fn cancel_admin_proposal(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::cancel_admin_proposal(&env, &caller)
    }

    /// Return the pending admin address, or `None` if no proposal is active.
    pub fn get_pending_admin(env: Env) -> Result<Option<Address>, ContractError> {
        admin::get_pending_admin(&env)
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

    /// Get full contract configuration (superset of get_stats).
    /// Returns all admin-readable configuration in a single call,
    /// reducing frontend RPC calls.
    pub fn get_config(env: Env) -> Result<ContractConfig, ContractError> {
        if !storage::is_initialized(&env) {
            return Err(ContractError::NotInitialized);
        }
        Ok(ContractConfig {
            admin: storage::get_admin(&env),
            fee_collector: storage::get_fee_collector(&env),
            fee_bps: storage::get_fee_bps(&env),
            native_token: storage::get_native_token(&env),
            total_creators: storage::get_total_creators(&env),
            total_tips_count: storage::get_tip_count(&env),
            total_tips_volume: storage::get_total_tips_volume(&env),
            total_fees_collected: storage::get_total_fees(&env),
            is_initialized: storage::is_initialized(&env),
            version: storage::get_version(&env),
        })
    }

    /// Extend the contract instance TTL manually (admin only).
    pub fn bump_ttl(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::bump_ttl(&env, &caller)
    }

    // ──────────────────────────────────────────────
    // Versioning
    // ──────────────────────────────────────────────

    /// Returns the on-chain stored contract version.
    ///
    /// Intended for frontend compatibility checks and upgrade coordination.
    /// Returns 0 if the contract has not been initialized.
    pub fn get_version(env: Env) -> u32 {
        storage::get_version(&env)
    }

    /// Replace the contract WASM bytecode and bump the stored version.
    ///
    /// # Security
    /// Only the stored admin address can call this function.
    ///
    /// # Arguments
    /// * `new_wasm_hash` — hash of the already-uploaded WASM blob to switch to.
    ///
    /// After this call the contract executes new WASM code and the stored
    /// version is incremented by one.
    pub fn upgrade(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), ContractError> {
        admin::upgrade(&env, &admin, &new_wasm_hash)
    }

    pub fn pause(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::pause(&env, &caller)
    }

    pub fn unpause(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::unpause(&env, &caller)
    }

    pub fn is_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    pub fn set_min_tip_amount(
        env: Env,
        caller: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        admin::set_min_tip_amount(&env, &caller, amount)
    }

    pub fn get_min_tip_amount(env: Env) -> i128 {
        storage::get_min_tip_amount(&env)
    }

    // ──────────────────────────────────────────────
    // Verification

    pub fn request_verification(
        env: Env,
        caller: Address,
        verification_type: crate::types::VerificationType,
    ) -> Result<(), ContractError> {
        verification::request_verification(&env, caller, verification_type)
    }

    pub fn approve_verification(
        env: Env,
        caller: Address,
        creator: Address,
        verification_type: crate::types::VerificationType,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        verification::approve_verification(&env, creator, verification_type)
    }

    pub fn revoke_verification(
        env: Env,
        caller: Address,
        creator: Address,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        verification::revoke_verification(&env, creator)
    }

    pub fn get_verification_status(
        env: Env,
        creator: Address,
    ) -> Result<crate::types::VerificationStatus, ContractError> {
        verification::get_verification_status(&env, creator)
    }

    // ──────────────────────────────────────────────
    // Subscriptions

    pub fn create_subscription(
        env: Env,
        subscriber: Address,
        creator: Address,
        amount: i128,
        interval_days: u32,
    ) -> Result<crate::types::Subscription, ContractError> {
        subscription::create_subscription(&env, subscriber, creator, amount, interval_days)
    }

    pub fn cancel_subscription(
        env: Env,
        subscriber: Address,
        creator: Address,
    ) -> Result<(), ContractError> {
        subscription::cancel_subscription(&env, subscriber, creator)
    }

    pub fn execute_due_subscription(
        env: Env,
        subscriber: Address,
        creator: Address,
    ) -> Result<(), ContractError> {
        subscription::execute_due_subscription(&env, subscriber, creator)
    }

    pub fn get_subscriptions(env: Env, subscriber: Address) -> Vec<crate::types::Subscription> {
        subscription::get_subscriptions(&env, subscriber)
    }

    pub fn get_subscribers(env: Env, creator: Address) -> Vec<crate::types::Subscription> {
        subscription::get_subscribers(&env, creator)
    }

    // ──────────────────────────────────────────────
    // Multi-signature Operations
    // ──────────────────────────────────────────────

    /// Set multi-signature configuration (admin only)
    pub fn set_multisig_config(
        env: Env,
        admin: Address,
        required_signatures: u32,
        signers: Vec<Address>,
    ) -> Result<(), ContractError> {
        multisig::set_multisig_config(&env, &admin, required_signatures, signers)
    }

    /// Get current multi-signature configuration
    pub fn get_multisig_config(env: Env) -> Option<multisig::MultisigConfig> {
        multisig::get_multisig_config(&env)
    }

    /// Propose a new action for multi-sig approval
    pub fn propose_action(
        env: Env,
        signer: Address,
        action: multisig::Action,
    ) -> Result<u32, ContractError> {
        multisig::propose_action(&env, &signer, action)
    }

    /// Approve an existing proposal
    pub fn approve_action(
        env: Env,
        signer: Address,
        proposal_id: u32,
    ) -> Result<(), ContractError> {
        multisig::approve_action(&env, &signer, proposal_id)
    }

    /// Get all pending proposals
    pub fn get_pending_proposals(env: Env) -> Vec<multisig::Proposal> {
        multisig::get_pending_proposals(&env)
    }

    /// Get a specific proposal by ID
    pub fn get_proposal(env: Env, proposal_id: u32) -> Option<multisig::Proposal> {
        multisig::get_proposal(&env, proposal_id)
    }

    // ──────────────────────────────────────────────
    // Donation Pages
    // ──────────────────────────────────────────────

    /// Set custom donation page configuration
    pub fn set_donation_page(
        env: Env,
        creator: Address,
        config: types::DonationPageConfig,
    ) -> Result<(), ContractError> {
        profile::set_donation_page(&env, &creator, config)
    }

    /// Get donation page configuration for a creator
    pub fn get_donation_page(
        env: Env,
        creator: Address,
    ) -> Result<types::DonationPageConfig, ContractError> {
        profile::get_donation_page(&env, &creator)
    }

    // ──────────────────────────────────────────────
    // Platform Statistics
    // ──────────────────────────────────────────────

    /// Get comprehensive platform statistics
    pub fn get_platform_stats(env: Env) -> Result<stats::PlatformStats, ContractError> {
        stats::get_platform_stats(&env)
    }

    /// Get statistics for a specific creator
    pub fn get_creator_stats(
        env: Env,
        creator: Address,
    ) -> Result<stats::CreatorStats, ContractError> {
        stats::get_creator_stats(&env, &creator)
    }
}
