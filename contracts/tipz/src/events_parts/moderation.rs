// ── Batch events ──────────────────────────────────────────────────────────────

/// Topics : `("batch", "skipped")`
/// Data   : `(creator: Address, reason: u32)`
///
/// `reason` codes:
/// - `0` — address is not registered
/// - `1` — metric values failed validation
pub fn emit_x_metrics_batch_skipped(env: &Env, creator: &Address, reason: u32) {
    env.events().publish(
        (symbol_short!("batch"), symbol_short!("skipped")),
        (1u32, creator.clone(), reason),
    );
}

/// Topics : `("batch", "done")`
/// Data   : `(processed: u32, skipped_count: u32, skipped_entries: Vec<BatchSkip>)`
pub fn emit_x_metrics_batch_completed(
    env: &Env,
    processed: u32,
    skipped_count: u32,
    skipped_entries: Vec<BatchSkip>,
) {
    env.events().publish(
        (symbol_short!("batch"), symbol_short!("done")),
        (processed, skipped_count, skipped_entries),
    );
}

// ── Verification events ───────────────────────────────────────────────────────

/// Topics : `("verify", "requested")`
/// Data   : `(creator: Address, verification_type: VerificationType)`
pub fn emit_verification_requested(
    env: &Env,
    creator: &Address,
    verification_type: &crate::types::VerificationType,
) {
    env.events().publish(
        (symbol_short!("verify"), symbol_short!("requested")),
        (creator.clone(), verification_type.clone()),
    );
}

/// Topics : `("verify", "approved")`
/// Data   : `(creator: Address, verification_type: VerificationType)`
pub fn emit_verification_approved(
    env: &Env,
    creator: &Address,
    verification_type: &crate::types::VerificationType,
) {
    env.events().publish(
        (symbol_short!("verify"), symbol_short!("approved")),
        (1u32, creator.clone(), verification_type.clone()),
    );
}

/// Topics : `("verify", "revoked")`
/// Data   : `(1, creator: Address)`
pub fn emit_verification_revoked(env: &Env, creator: &Address) {
    env.events().publish(
        (symbol_short!("verify"), symbol_short!("revoked")),
        (1u32, creator.clone()),
    );
}

// ── Subscription events ──────────────────────────────────────────────────────

/// Topics : `("sub", "created")`
pub fn emit_subscription_created(
    env: &Env,
    subscriber: &Address,
    creator: &Address,
    amount: i128,
    interval_days: u32,
    next_due: u64,
) {
    env.events().publish(
        (symbol_short!("sub"), symbol_short!("created")),
        (
            1u32,
            subscriber.clone(),
            creator.clone(),
            amount,
            interval_days,
            next_due,
        ),
    );
}

/// Topics : `("sub", "cancel")`
pub fn emit_subscription_cancelled(env: &Env, subscriber: &Address, creator: &Address) {
    env.events().publish(
        (symbol_short!("sub"), symbol_short!("cancel")),
        (1u32, subscriber.clone(), creator.clone()),
    );
}

/// Topics : `("sub", "exec")`
pub fn emit_subscription_executed(
    env: &Env,
    subscriber: &Address,
    creator: &Address,
    amount: i128,
    interval_days: u32,
    next_due: u64,
) {
    env.events().publish(
        (symbol_short!("sub"), symbol_short!("exec")),
        (1u32, subscriber.clone(), creator.clone(), amount, interval_days, next_due),
    );
}


