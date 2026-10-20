    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Credit Score
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    /// The score (0â€“100) is derived from the profile's tip volume, X metrics,
    /// and account age.  Newly registered profiles start at **40** (Silver).
    ///
    /// # Errors
    /// Returns [`ContractError::NotRegistered`] when no profile exists for
    /// `address`.
    pub fn get_credit_tier(env: Env, address: Address) -> Result<(u32, CreditTier), ContractError> {
        credit::get_credit_tier(&env, &address)
    }

    /// Return the weighted credit score breakdown for a registered profile,
    /// including staleness metadata (`computed_at_ledger`, `ledger_age`, `is_stale`).
    pub fn get_credit_breakdown(
        env: Env,
        address: Address,
    ) -> Result<CreditBreakdown, ContractError> {
        credit::get_credit_breakdown(&env, &address)
    }

    /// Set the number of ledgers after which a stored credit score is considered
    /// stale. Default is 8,640 ledgers (~12 hours at 5 s/ledger).
    ///
    /// # Authorization
    /// Requires admin signature.
    pub fn set_credit_staleness_threshold(
        env: Env,
        caller: Address,
        threshold_ledgers: u32,
    ) -> Result<(), ContractError> {
        storage::extend_instance_ttl(&env);
        admin::require_admin(&env, &caller)?;
        storage::set_credit_staleness_threshold(&env, threshold_ledgers);
        Ok(())
    }

    /// Recompute credit scores for a page of creators starting at `cursor`.
    ///
    /// Returns `(next_cursor, is_done)`. Call repeatedly with the returned
    /// cursor until `is_done == true` to recompute the full set. `limit` is
    /// clamped to 50 to bound per-call CPU usage.
    ///
    /// # Authorization
    /// Requires admin signature.
    pub fn recompute_credit_scores_page(
        env: Env,
        caller: Address,
        cursor: u32,
        limit: u32,
    ) -> Result<(u32, bool), ContractError> {
        storage::extend_instance_ttl(&env);
        admin::require_admin(&env, &caller)?;
        Ok(credit::recompute_credit_scores_page(&env, cursor, limit))
    }

    /// Register an on-chain price oracle for `token`.
    /// The oracle must implement `get_price(token: Address) -> OraclePrice`.
    ///
    /// # Authorization
    /// Requires admin signature.
    pub fn set_token_oracle(
        env: Env,
        caller: Address,
        token: Address,
        oracle: Address,
    ) -> Result<(), ContractError> {
        oracle::set_token_oracle(&env, &caller, &token, &oracle)
    }

    /// Remove the price oracle for `token` (reverts to native-only ranking).
    ///
    /// # Authorization
    /// Requires admin signature.
    pub fn remove_token_oracle(
        env: Env,
        caller: Address,
        token: Address,
    ) -> Result<(), ContractError> {
        oracle::remove_token_oracle(&env, &caller, &token)
    }

    /// Return the current staleness threshold in ledgers.
    pub fn get_credit_staleness_threshold(env: Env) -> u32 {
        storage::get_credit_staleness_threshold(&env)
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

