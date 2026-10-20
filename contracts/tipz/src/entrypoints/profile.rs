    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Profile Management
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    /// Update social links for a profile with limit enforcement (max 5 links).
    pub fn update_social_links(
        env: Env,
        caller: Address,
        social_links: soroban_sdk::Map<soroban_sdk::Symbol, String>,
    ) -> Result<(), ContractError> {
        profile::update_social_links(&env, caller, social_links)
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

