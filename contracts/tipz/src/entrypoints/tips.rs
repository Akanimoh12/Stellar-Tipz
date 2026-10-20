    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Tipping
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /// Send an XLM tip to a registered creator.
    ///
    /// Optional `expected_min_tip` and `expected_fee_bps` pin the config the
    /// caller observed. A mismatch returns [`ContractError::ConfigMismatch`]
    /// before any state change. Passing `None` for either preserves existing
    /// behaviour for that check.
    pub fn send_tip(
        env: Env,
        tipper: Address,
        creator: Address,
        amount: i128,
        message: String,
        is_anonymous: bool,
        is_encrypted: bool,
        expected_min_tip: Option<i128>,
        expected_fee_bps: Option<u32>,
    ) -> Result<(), ContractError> {
        tips::send_tip(
            &env,
            &tipper,
            &creator,
            amount,
            &message,
            is_anonymous,
            is_encrypted,
            expected_min_tip,
            expected_fee_bps,
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

    /// Send tips to multiple creators atomically.
    ///
    /// All recipients are validated before any transfers occur. If any recipient
    /// is invalid or blocked, the entire batch reverts (all-or-nothing semantics).
    /// Per-tip events emit individually, so the indexer needs no changes.
    ///
    /// # Parameters
    /// - `from` â€“ the address sending all tips (must authenticate)
    /// - `recipients` â€“ Vec<(creator_address, amount)>, max 5 entries, max 5 XLM per tip
    /// - `message` â€“ optional message (max 280 chars, sent with all tips)
    ///
    /// # Returns
    /// Number of tips successfully sent on success.
    ///
    /// # Errors
    /// - `BatchTooLarge` if more than max recipients
    /// - `InvalidInput` if recipients is empty
    /// - `NotRegistered` if any recipient has no profile
    /// - `CannotTipSelf` if from tries to tip themselves
    /// - `TipperBlocked` if any creator blocked from
    /// - `BelowCreatorMinimum` if any tip is below creator's minimum
    /// - Other send_tip errors (paused, rate limited, etc.)
    pub fn batch_tip(
        env: Env,
        from: Address,
        recipients: Vec<(Address, i128)>,
        message: String,
    ) -> Result<u32, ContractError> {
        tips::batch_tip(&env, &from, recipients, &message)
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

    /// Get a single tip record by its ID (public view).
    ///
    /// For anonymous tips the sender is redacted to the contract address;
    /// the stable `pseudonym` hash is still returned so clients can group
    /// tips from one anonymous tipper without learning who sent them.
    ///
    /// Returns [`ContractError::NotFound`] when the tip does not exist or its
    /// temporary-storage TTL has expired (~7 days after the tip was sent).
    pub fn get_tip(env: Env, tip_id: u32) -> Result<Tip, ContractError> {
        tips::get_tip_public(&env, tip_id).ok_or(ContractError::NotFound)
    }

    /// Return up to `limit` recent tips received by `creator`, newest first.
    ///
    /// - Anonymous tips have their sender redacted to the contract address;
    ///   use the stable `pseudonym` hash to group them instead.
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

    pub fn block_tipper(env: Env, creator: Address, tipper: Address) -> Result<(), ContractError> {
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

