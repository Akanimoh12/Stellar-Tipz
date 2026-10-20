    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Refund Mechanism
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
