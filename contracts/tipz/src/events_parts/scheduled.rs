// ── Scheduled Tip events ─────────────────────────────────────────────────────

/// Topics : `("schedtip", "create")`
pub fn emit_scheduled_tip_created(
    env: &Env,
    scheduled_tip_id: u32,
    sender: &Address,
    creator: &Address,
    amount: i128,
    deliver_at: u64,
) {
    env.events().publish(
        (
            symbol_short!("schedtip"),
            symbol_short!("create"),
            scheduled_tip_id,
        ),
        (sender.clone(), creator.clone(), amount, deliver_at),
    );
}

/// Topics : `("schedtip", "deliver")`
pub fn emit_scheduled_tip_delivered(
    env: &Env,
    scheduled_tip_id: u32,
    creator: &Address,
) {
    env.events().publish(
        (
            symbol_short!("schedtip"),
            symbol_short!("deliver"),
            scheduled_tip_id,
        ),
        (creator.clone(),),
    );
}

/// Topics : `("schedtip", "cancel")`
pub fn emit_scheduled_tip_cancelled(
    env: &Env,
    scheduled_tip_id: u32,
    sender: &Address,
    refund_amount: i128,
    cancellation_fee: i128,
) {
    env.events().publish(
        (
            symbol_short!("schedtip"),
            symbol_short!("cancel"),
            scheduled_tip_id,
        ),
        (sender.clone(), refund_amount, cancellation_fee),
    );
}


