    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Admin
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    /// so an inactive creator's profile â€” and the balance it guards â€” never
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

