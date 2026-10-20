/// A change takes effect at the current period boundary; last scheduled change wins.
pub fn emit_subscription_change(env: &Env, subscriber: &Address, creator: &Address, amount: i128, interval_days: u32, effective_at: u64) {
    env.events().publish(
        (symbol_short!("sub"), symbol_short!("change")),
        (1u32, subscriber.clone(), creator.clone(), amount, interval_days, effective_at),
    );
}

