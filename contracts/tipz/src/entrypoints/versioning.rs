    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Versioning
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    /// * `new_wasm_hash` â€” hash of the already-uploaded WASM blob to switch to.
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

    pub fn pause(env: Env, caller: Address, flag: u32) -> Result<(), ContractError> {
        admin::pause(&env, &caller, crate::types::PauseFlag::from_u32(flag))
    }

    pub fn unpause(env: Env, caller: Address, flag: u32) -> Result<(), ContractError> {
        admin::unpause(&env, &caller, crate::types::PauseFlag::from_u32(flag))
    }

    pub fn is_paused(env: Env, flag: u32) -> bool {
        storage::is_paused(&env, crate::types::PauseFlag::from_u32(flag))
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

    /// Set the minimum withdrawal amount. Admin only.
    pub fn set_min_withdrawal_amount(
        env: Env,
        caller: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        admin::set_min_withdrawal_amount(&env, &caller, amount)
    }

    /// Get the minimum withdrawal amount.
    pub fn get_min_withdrawal_amount(env: Env) -> i128 {
        storage::get_min_withdrawal_amount(&env)
    }

    /// Configure the contract-level withdrawal circuit breaker. Admin only.
    ///
    /// When enabled, gross withdrawal volume is tracked in a bounded set of
    /// buckets. Exceeding `threshold` within `window_secs` auto-pauses the
    /// contract before the withdrawal transfers funds.
    pub fn set_circuit_breaker_config(
        env: Env,
        caller: Address,
        enabled: bool,
        threshold: i128,
        window_secs: u64,
        bucket_count: u32,
    ) -> Result<(), ContractError> {
        circuit_breaker::configure(&env, &caller, enabled, threshold, window_secs, bucket_count)
    }

    /// Clear circuit-breaker volume buckets and unpause if the breaker tripped.
    pub fn reset_circuit_breaker(env: Env, caller: Address) -> Result<(), ContractError> {
        circuit_breaker::reset(&env, &caller)
    }

    /// Return current withdrawal circuit breaker configuration.
    pub fn get_circuit_breaker_config(env: Env) -> crate::types::CircuitBreakerConfig {
        circuit_breaker::get_config(&env)
    }

    /// Return current withdrawal circuit breaker fixed-bucket state.
    pub fn get_circuit_breaker_status(env: Env) -> crate::types::CircuitBreakerStatus {
        circuit_breaker::get_status(&env)
    }

    /// Set the maximum sender contribution to a creator's leaderboard score in basis points.
    /// Admin only.
    pub fn set_max_sender_contribution(
        env: Env,
        caller: Address,
        bps: u32,
    ) -> Result<(), ContractError> {
        admin::set_max_sender_contribution(&env, &caller, bps)
    }

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

