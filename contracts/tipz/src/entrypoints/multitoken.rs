    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Multi-Token Support
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

