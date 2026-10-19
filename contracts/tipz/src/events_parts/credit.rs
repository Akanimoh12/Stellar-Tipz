// ── Credit score events ───────────────────────────────────────────────────────

/// Topics : `("credit", "updated")`
/// Data   : `(1, creator: Address, old_score: u32, new_score: u32)`
pub fn emit_credit_score_updated(env: &Env, creator: &Address, old_score: u32, new_score: u32) {
    env.events().publish(
        (symbol_short!("credit"), symbol_short!("updated")),
        (1u32, creator.clone(), old_score, new_score),
    );
}

/// Topics : `("streak", "milestone")`
/// Data   : `(1, supporter: Address, creator: Address, current: u32)`
pub fn emit_streak_milestone(env: &Env, supporter: &Address, creator: &Address, current: u32) {
    env.events().publish(
        (symbol_short!("streak"), symbol_short!("milestone")),
        (1u32, supporter.clone(), creator.clone(), current),
    );
}

