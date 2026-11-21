    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Inactive Profile Cleanup (DoS Protection)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

