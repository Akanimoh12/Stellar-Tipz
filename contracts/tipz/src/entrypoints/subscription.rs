    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Subscriptions

    pub fn create_subscription(
        env: Env,
        subscriber: Address,
        creator: Address,
        amount: i128,
        interval_days: u32,
    ) -> Result<crate::types::Subscription, ContractError> {
        subscription::create_subscription(&env, subscriber, creator, amount, interval_days)
    }

    pub fn cancel_subscription(
        env: Env,
        subscriber: Address,
        creator: Address,
    ) -> Result<(), ContractError> {
        subscription::cancel_subscription(&env, subscriber, creator)
    }

    pub fn execute_due_subscription(
        env: Env,
        subscriber: Address,
        creator: Address,
    ) -> Result<(), ContractError> {
        subscription::execute_due_subscription(&env, subscriber, creator)
    }

    pub fn execute_subscriptions(env: Env, limit: u32) -> Result<u32, ContractError> {
        subscription::execute_subscriptions(&env, limit)
    }

    pub fn get_subscriptions(env: Env, subscriber: Address) -> Vec<crate::types::Subscription> {
        subscription::get_subscriptions(&env, subscriber)
    }

    pub fn get_subscribers(env: Env, creator: Address) -> Vec<crate::types::Subscription> {
        subscription::get_subscribers(&env, creator)
    }

