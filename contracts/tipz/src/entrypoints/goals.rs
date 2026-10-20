    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Goal Tracking
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

