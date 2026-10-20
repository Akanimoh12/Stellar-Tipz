    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Leaderboard
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    /// Return the current number of entries on the leaderboard for a specific period (0â€“50).
    pub fn get_leaderboard_size(env: Env, period: crate::types::LeaderboardPeriod) -> u32 {
        leaderboard::get_leaderboard_size(&env, period)
    }

