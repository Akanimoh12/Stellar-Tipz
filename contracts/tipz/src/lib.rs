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

pub mod admin;
pub mod credit;
pub mod errors;
pub mod events;
pub mod fees;
pub mod goals;
pub mod leaderboard;
pub mod migrations;
pub mod multisig;
pub mod multitoken;
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
pub const CONTRACT_VERSION: u32 = 3;

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

    /// Deactivate a creator profile (owner deactivates self, or admin moderates `creator`).
    ///
    /// Hides the creator from the leaderboard and blocks tips; profile data and balance remain.
    pub fn deactivate_profile(
        env: Env,
        caller: Address,
        creator: Address,
    ) -> Result<(), ContractError> {
        profile::deactivate_profile(&env, caller, creator)
    }

    /// Reactivate a previously deactivated profile (owner or admin).
    pub fn reactivate_profile(
        env: Env,
        caller: Address,
        creator: Address,
    ) -> Result<(), ContractError> {
        profile::reactivate_profile(&env, caller, creator)
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

    /// Get a profile by address, including deactivation status.
    pub fn get_profile(
        env: Env,
        address: Address,
    ) -> Result<ProfileWithDeactivation, ContractError> {
        profile::get_profile_with_deactivation(&env, &address)
    }

    /// Get a profile by username, including deactivation status.
    pub fn get_profile_by_username(
        env: Env,
        username: String,
    ) -> Result<ProfileWithDeactivation, ContractError> {
        let address =
            storage::get_username_address(&env, &username).ok_or(ContractError::NotFound)?;
        // Guard against orphaned state: Profile exists but UsernameToAddress expired (or vice versa).
        if !storage::is_profile_active(&env, &address) {
            return Err(ContractError::NotFound);
        }
        profile::get_profile_with_deactivation(&env, &address)
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
        is_encrypted: bool,
    ) -> Result<(), ContractError> {
        tips::send_tip(
            &env,
            &tipper,
            &creator,
            amount,
            &message,
            is_anonymous,
            is_encrypted,
        )
    }

    /// Send a tip on behalf of someone else.
    pub fn send_tip_on_behalf(
        env: Env,
        sender: Address,
        on_behalf_of: Address,
        creator: Address,
        amount: i128,
        message: String,
    ) -> Result<(), ContractError> {
        tips::send_tip_on_behalf(&env, &sender, &on_behalf_of, &creator, amount, &message)
    }

    /// Withdraw accumulated tips (fee deducted).
    pub fn withdraw_tips(env: Env, caller: Address, amount: i128) -> Result<(), ContractError> {
        tips::withdraw_tips(&env, &caller, amount)
    }

    /// Time-delayed emergency withdrawal for creators during an extended contract pause (#1178).
    pub fn emergency_withdraw_tips(
        env: Env,
        caller: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        tips::emergency_withdraw_tips(&env, &caller, amount)
    }

    /// Returns the timestamp when contract was paused, or None if active.
    pub fn get_paused_at(env: Env) -> Option<u64> {
        storage::get_paused_at(&env)
    }

    /// Return the currently pending fee change, if any.
    pub fn get_pending_fee_change(env: Env) -> Option<(u32, u32, u32, bool)> {
        storage::get_pending_fee_change(&env)
    }

    /// Return the configured minimum fee-change delay in ledgers.
    pub fn get_fee_change_delay_ledgers(env: Env) -> u32 {
        storage::get_fee_change_delay_ledgers(&env)
    }

    /// Returns the required pause delay (7 days) before emergency withdrawal is unlocked.
    pub fn get_emergency_withdrawal_delay(_env: Env) -> u64 {
        admin::EMERGENCY_WITHDRAWAL_DELAY_SECS
    }

    /// Execute or resume a versioned storage migration to target_version (#1173). Admin only.
    pub fn migrate(
        env: Env,
        caller: Address,
        target_version: u32,
        batch_size: u32,
    ) -> Result<MigrationState, ContractError> {
        migrations::migrate(&env, &caller, target_version, batch_size)
    }

    /// Returns the current active migration state, if any.
    pub fn get_migration_state(env: Env) -> Option<MigrationState> {
        storage::get_migration_state(&env)
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

    pub fn block_tipper(
        env: Env,
        creator: Address,
        tipper: Address,
    ) -> Result<(), ContractError> {
        tips::block_tipper(&env, &creator, &tipper)
    }

    pub fn unblock_tipper(
        env: Env,
        creator: Address,
        tipper: Address,
    ) -> Result<(), ContractError> {
        tips::unblock_tipper(&env, &creator, &tipper)
    }

    pub fn is_tipper_blocked(env: Env, creator: Address, tipper: Address) -> bool {
        tips::is_tipper_blocked(&env, &creator, &tipper)
    }

    pub fn get_blocked_tipper_count(env: Env, creator: Address) -> u32 {
        tips::get_blocked_tipper_count(&env, &creator)
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
    /// Returns at most `limit` entries. Passing `limit = 0` returns all
    /// stored entries (up to 50).
    pub fn get_leaderboard(
        env: Env,
        period: crate::types::LeaderboardPeriod,
        limit: u32,
    ) -> Result<Vec<crate::types::LeaderboardEntry>, ContractError> {
        Ok(leaderboard::get_leaderboard(&env, period, limit))
    }

    /// Reset a specific leaderboard period (admin only).
    pub fn reset_leaderboard(
        env: Env,
        caller: Address,
        period: crate::types::LeaderboardPeriod,
    ) -> Result<(), ContractError> {
        admin::require_admin(&env, &caller)?;
        leaderboard::reset_leaderboard(&env, period);
        admin::log_admin_action(
            &env,
            &caller,
            soroban_sdk::Symbol::new(&env, "reset_leaderboard"),
            String::from_str(&env, ""),
            String::from_str(&env, "reset"),
        );
        Ok(())
    }

    /// Return the 1-based rank of `address` on the leaderboard for a specific period,
    /// or `None` when the address has not yet appeared in the top 50.
    pub fn get_leaderboard_rank(
        env: Env,
        period: crate::types::LeaderboardPeriod,
        address: Address,
    ) -> Option<u32> {
        leaderboard::get_leaderboard_rank(&env, period, &address)
    }

    /// Return the current number of entries on the leaderboard for a specific period (0–50).
    pub fn get_leaderboard_size(env: Env, period: crate::types::LeaderboardPeriod) -> u32 {
        leaderboard::get_leaderboard_size(&env, period)
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

    /// Propose a withdrawal fee change with a timelock for increases.
    pub fn propose_fee_change(
        env: Env,
        caller: Address,
        fee_bps: u32,
    ) -> Result<(), ContractError> {
        admin::propose_fee_change(&env, &caller, fee_bps)
    }

    /// Apply a pending withdrawal fee change.
    pub fn apply_fee_change(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::apply_fee_change(&env, &caller)
    }

    /// Cancel a pending withdrawal fee change.
    pub fn cancel_fee_change(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::cancel_fee_change(&env, &caller)
    }

    /// Update the configured fee-change delay in ledgers. Admin only.
    pub fn set_fee_change_delay(
        env: Env,
        caller: Address,
        delay_ledgers: u32,
    ) -> Result<(), ContractError> {
        admin::set_fee_change_delay(&env, &caller, delay_ledgers)
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
    /// Clears any pending time-locked admin proposal. Records the handoff in admin change history.
    pub fn set_admin(env: Env, caller: Address, new_admin: Address) -> Result<(), ContractError> {
        admin::set_admin(&env, &caller, &new_admin)
    }

    /// Propose a new admin with a 48-hour time lock (current admin only).
    pub fn propose_admin_change(
        env: Env,
        caller: Address,
        new_admin: Address,
    ) -> Result<(), ContractError> {
        admin::propose_admin_change(&env, &caller, &new_admin)
    }

    /// Confirm the pending admin change after the time lock (proposed new admin only).
    pub fn confirm_admin_change(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::confirm_admin_change(&env, &caller)
    }

    /// Cancel the pending time-locked admin change (current admin only).
    pub fn cancel_admin_change(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::cancel_admin_change(&env, &caller)
    }

    /// Return the pending admin-change proposal, if any.
    pub fn get_admin_change_proposal(
        env: Env,
    ) -> Result<Option<AdminChangeProposal>, ContractError> {
        admin::get_admin_change_proposal(&env)
    }

    /// Return admin change history entries, newest first (`offset` skips from the newest).
    pub fn get_admin_change_history(
        env: Env,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<AdminChangeHistoryEntry>, ContractError> {
        admin::get_admin_change_history(&env, limit, offset)
    }

    /// Return admin audit log entries, newest first (`offset` skips from the newest).
    pub fn get_admin_audit_history(
        env: Env,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<AdminAuditEntry>, ContractError> {
        admin::get_admin_audit_history(&env, limit, offset)
    }

    /// Return total count of admin audit log entries recorded over time.
    pub fn get_admin_audit_count(env: Env) -> Result<u32, ContractError> {
        if !storage::is_initialized(&env) {
            return Err(ContractError::NotInitialized);
        }
        Ok(storage::get_admin_audit_count(&env))
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
            subscription_limit: storage::get_subscription_limit(&env),
        })
    }

    /// Extend the contract instance TTL manually (admin only).
    pub fn bump_ttl(env: Env, caller: Address) -> Result<(), ContractError> {
        admin::bump_ttl(&env, &caller)
    }

    /// Extend the TTL of a creator's profile (and its username reverse-lookup)
    /// so an inactive creator's profile — and the balance it guards — never
    /// archives mid-lifecycle (#1175).
    ///
    /// Permissionless by design: anyone can call and pay the fee to keep a
    /// profile alive, so a creator who has been quiet never loses access to
    /// their funds through archival.
    pub fn bump_profile_ttl(env: Env, creator: Address) {
        storage::bump_profile_ttl(&env, &creator);
        if let Some(profile) = storage::get_profile_opt(&env, &creator) {
            storage::bump_username_ttl(&env, &profile.username);
        }
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
    pub fn propose_upgrade(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<BytesN<32>, ContractError> {
        admin::propose_upgrade(&env, &admin, &new_wasm_hash)
    }

    pub fn get_proposed_upgrade(env: Env) -> Option<BytesN<32>> {
        admin::get_proposed_upgrade(&env)
    }

    pub fn cancel_upgrade(env: Env, admin: Address) -> Result<(), ContractError> {
        admin::cancel_upgrade(&env, &admin)
    }

    pub fn execute_upgrade(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
    ) -> Result<(), ContractError> {
        admin::upgrade(&env, &admin, &new_wasm_hash)
    }

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

    pub fn set_min_withdrawal_amount(env: Env, caller: Address, amount: i128) -> Result<(), ContractError> { admin::set_min_withdrawal_amount(&env, &caller, amount) }
    pub fn get_min_withdrawal_amount(env: Env) -> i128 { storage::get_min_withdrawal_amount(&env) }

    /// Update rate limit configuration. Admin only.
    pub fn set_rate_limit_config(
        env: Env,
        caller: Address,
        max_ops: u32,
        window_secs: u64,
    ) -> Result<(), ContractError> {
        admin::require_admin(&env, &caller)?;
        storage::set_rate_limit_config(
            &env,
            &crate::types::RateLimitConfig {
                max_ops,
                window_secs,
            },
        );
        admin::log_admin_action(
            &env,
            &caller,
            soroban_sdk::Symbol::new(&env, "set_rate_limit_config"),
            String::from_str(&env, ""),
            admin::u32_to_string(&env, max_ops),
        );
        Ok(())
    }

    /// Get current rate limit configuration.
    pub fn get_rate_limit_config(env: Env) -> crate::types::RateLimitConfig {
        storage::get_rate_limit_config(&env)
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

    pub fn is_verification_expired(env: Env, creator: Address) -> Result<bool, ContractError> {
        verification::is_verification_expired(&env, creator)
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

    pub fn execute_subscriptions(env: Env, limit: u32) -> Result<u32, ContractError> {
        subscription::execute_subscriptions(&env, limit)
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

    /// Cancel a proposal (only the proposer can cancel)
    pub fn cancel_proposal(
        env: Env,
        proposer: Address,
        proposal_id: u32,
    ) -> Result<(), ContractError> {
        multisig::cancel_proposal(&env, &proposer, proposal_id)
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

    /// Set a custom minimum tip amount for a creator profile.
    ///
    /// Pass `0` to reset to the global minimum.
    pub fn set_min_tip(env: Env, creator: Address, min_amount: i128) -> Result<(), ContractError> {
        profile::set_min_tip(&env, creator, min_amount)
    }

    /// Return the effective minimum tip for a creator (custom or global default).
    pub fn get_creator_min_tip(env: Env, creator: Address) -> Result<i128, ContractError> {
        profile::get_creator_min_tip(&env, &creator)
    }

    /// Set the domain to verify via stellar.toml (marks verification as pending).
    pub fn set_domain(env: Env, creator: Address, domain: String) -> Result<(), ContractError> {
        profile::set_domain(&env, creator, domain)
    }

    // ──────────────────────────────────────────────
    // Inactive Profile Cleanup (DoS Protection)
    // ──────────────────────────────────────────────

    /// Check if a profile is eligible for cleanup based on inactivity.
    ///
    /// Returns `true` when the profile has been inactive beyond the threshold
    /// and has a zero balance.
    pub fn is_profile_inactive_eligible(env: Env, address: Address) -> bool {
        profile::is_profile_inactive_eligible(&env, &address)
    }

    /// Cleanup an inactive profile (admin only).
    ///
    /// Removes a profile that has been inactive beyond the inactivity threshold
    /// and has a zero balance. Prevents storage bloat from abandoned profiles.
    ///
    /// Returns the cleaned up profile's username on success.
    pub fn cleanup_inactive_profile(
        env: Env,
        admin: Address,
        target: Address,
    ) -> Result<String, ContractError> {
        profile::cleanup_inactive_profile(&env, admin, target)
    }

    /// Batch cleanup of inactive profiles (admin only).
    ///
    /// Iterates over a list of addresses and removes those that meet inactivity
    /// criteria. Capped at 20 per call to stay within resource limits.
    ///
    /// Returns the number of profiles actually cleaned up.
    pub fn cleanup_inactive_profiles(
        env: Env,
        admin: Address,
        targets: Vec<Address>,
        max_cleanup: u32,
    ) -> Result<u32, ContractError> {
        profile::cleanup_inactive_profiles(&env, admin, targets, max_cleanup)
    }

    /// Admin confirms domain verification after off-chain stellar.toml check.
    pub fn verify_domain(env: Env, caller: Address, creator: Address) -> Result<(), ContractError> {
        admin::verify_domain(&env, &caller, &creator)
    }

    /// Configure domain re-verification interval in seconds (admin only).
    pub fn set_domain_reverify_interval(
        env: Env,
        caller: Address,
        interval_secs: u64,
    ) -> Result<(), ContractError> {
        admin::set_domain_reverify_interval(&env, &caller, interval_secs)
    }

    /// Return the configured domain re-verification interval in seconds.
    pub fn get_domain_reverify_interval(env: Env) -> u64 {
        storage::get_domain_reverification_interval(&env)
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

    // ──────────────────────────────────────────────
    // Goal Tracking
    // ──────────────────────────────────────────────

    /// Set a fundraising goal for a creator
    pub fn set_goal(
        env: Env,
        creator: Address,
        target_amount: i128,
        description: String,
        deadline: u64,
    ) -> Result<(), ContractError> {
        goals::set_goal(&env, &creator, target_amount, &description, deadline)
    }

    /// Get the active goal for a creator
    pub fn get_goal(env: Env, creator: Address) -> Result<types::Goal, ContractError> {
        goals::get_goal(&env, &creator)
    }

    /// Cancel the active goal for a creator
    pub fn cancel_goal(env: Env, creator: Address) -> Result<(), ContractError> {
        goals::cancel_goal(&env, &creator)
    }

    /// Get archived goals for a creator
    pub fn get_archived_goals(env: Env, creator: Address) -> Vec<types::Goal> {
        goals::get_archived_goals(&env, &creator)
    }

    // ──────────────────────────────────────────────
    // Multi-Token Support
    // ──────────────────────────────────────────────

    /// Add a token to the whitelist of accepted tokens (admin only)
    pub fn add_accepted_token(
        env: Env,
        admin: Address,
        token: Address,
        oracle: Option<Address>,
    ) -> Result<(), ContractError> {
        multitoken::add_accepted_token(&env, &admin, &token, oracle)
    }

    /// Remove a token from the whitelist (admin only)
    pub fn remove_accepted_token(
        env: Env,
        admin: Address,
        token: Address,
    ) -> Result<(), ContractError> {
        multitoken::remove_accepted_token(&env, &admin, &token)
    }

    /// Get list of all accepted tokens
    pub fn get_accepted_tokens(env: Env) -> Vec<types::AcceptedToken> {
        multitoken::get_accepted_tokens(&env)
    }

    /// Send a tip using a specific token
    pub fn send_tip_token(
        env: Env,
        tipper: Address,
        creator: Address,
        amount: i128,
        token: Address,
        message: String,
        is_anonymous: bool,
    ) -> Result<(), ContractError> {
        multitoken::send_tip_token(
            &env,
            &tipper,
            &creator,
            amount,
            &token,
            &message,
            is_anonymous,
        )
    }

    /// Withdraw accumulated tips in a specific token
    pub fn withdraw_token(
        env: Env,
        caller: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        multitoken::withdraw_token(&env, &caller, &token, amount)
    }

    /// Get all token balances for a creator
    pub fn get_token_balances(env: Env, creator: Address) -> Vec<types::TokenBalance> {
        multitoken::get_token_balances(&env, &creator)
    }

    // ──────────────────────────────────────────────
    // Refund Mechanism
    // ──────────────────────────────────────────────

    /// Request a refund for a tip within the allowed time window.
    ///
    /// The tipper can request a refund within a configurable window (default 24 hours).
    /// The refund amount is the original tip minus a non-refundable platform fee.
    ///
    /// # Parameters
    /// - `tipper` - The address that sent the tip
    /// - `tip_id` - The ID of the tip to refund
    ///
    /// # Errors
    /// - [`ContractError::NotFound`] - Tip doesn't exist or has expired
    /// - [`ContractError::NotTipper`] - Caller is not the tipper
    /// - [`ContractError::RefundWindowExpired`] - Request window has passed
    /// - [`ContractError::RefundAlreadyRequested`] - Refund already requested
    pub fn request_refund(env: Env, tipper: Address, tip_id: u32) -> Result<(), ContractError> {
        refund::request_refund(&env, &tipper, tip_id)
    }

    /// Creator approves a refund request.
    ///
    /// The creator can approve a pending refund request, which will transfer
    /// the refund amount (original tip minus non-refundable fee) back to the tipper.
    ///
    /// # Parameters
    /// - `creator` - The creator who received the tip
    /// - `tip_id` - The ID of the tip to refund
    ///
    /// # Errors
    /// - [`ContractError::NoRefundRequest`] - No refund request exists
    /// - [`ContractError::NotCreator`] - Caller is not the creator
    /// - [`ContractError::RefundAlreadyProcessed`] - Refund already processed
    pub fn approve_refund(env: Env, creator: Address, tip_id: u32) -> Result<(), ContractError> {
        refund::approve_refund(&env, &creator, tip_id)
    }

    /// Creator rejects a refund request.
    ///
    /// The creator can reject a pending refund request. The tip remains with
    /// the creator and the tipper receives no refund.
    ///
    /// # Parameters
    /// - `creator` - The creator who received the tip
    /// - `tip_id` - The ID of the tip to refund
    ///
    /// # Errors
    /// - [`ContractError::NoRefundRequest`] - No refund request exists
    /// - [`ContractError::NotCreator`] - Caller is not the creator
    /// - [`ContractError::RefundAlreadyProcessed`] - Refund already processed
    pub fn reject_refund(env: Env, creator: Address, tip_id: u32) -> Result<(), ContractError> {
        refund::reject_refund(&env, &creator, tip_id)
    }

    /// Process pending refunds that have exceeded the response window.
    ///
    /// Auto-approves refund requests where the creator hasn't responded within
    /// the configured timeout (default 48 hours). Can be called by anyone.
    ///
    /// # Parameters
    /// - `tip_ids` - List of tip IDs to check and process
    ///
    /// # Returns
    /// Number of refunds that were auto-approved
    pub fn process_pending_refunds(
        env: Env,
        tip_ids: soroban_sdk::Vec<u32>,
    ) -> Result<u32, ContractError> {
        refund::process_pending_refunds(&env, tip_ids)
    }

    /// Process pending refunds using the on-chain refund index and a resumable cursor.
    pub fn process_pending_refunds_from(
        env: Env,
        cursor: u32,
        limit: u32,
    ) -> Result<(u32, u32), ContractError> {
        refund::process_pending_refunds_from(&env, cursor, limit)
    }

    /// Expire a pending refund request that has exceeded the TTL.
    ///
    /// This removes the expired refund request from storage.
    ///
    /// # Parameters
    /// - `tip_id` - The ID of the tip with the refund request to expire
    pub fn expire_refund(env: Env, tip_id: u32) -> Result<(), ContractError> {
        refund::expire_refund(&env, tip_id)
    }

    /// Get refund request by tip ID.
    ///
    /// Returns the refund request details if one exists for the given tip.
    ///
    /// # Parameters
    /// - `tip_id` - The ID of the tip
    ///
    /// # Returns
    /// The refund request if it exists, None otherwise
    pub fn get_refund_request(env: Env, tip_id: u32) -> Option<types::RefundRequest> {
        refund::get_refund_request(&env, tip_id)
    }

    /// Get refund configuration.
    ///
    /// Returns the current refund configuration including time windows and fees.
    pub fn get_refund_config(env: Env) -> types::RefundConfig {
        refund::get_refund_config(&env)
    }

    /// Set refund configuration (admin only).
    ///
    /// Updates the refund configuration including request window, response window,
    /// and non-refundable fee percentage.
    ///
    /// # Parameters
    /// - `admin` - The admin address
    /// - `config` - The new refund configuration
    ///
    /// # Errors
    /// - [`ContractError::NotAuthorized`] - Caller is not the admin
    pub fn set_refund_config(
        env: Env,
        admin: Address,
        config: types::RefundConfig,
    ) -> Result<(), ContractError> {
        refund::set_refund_config(&env, &admin, config)
    }
}
