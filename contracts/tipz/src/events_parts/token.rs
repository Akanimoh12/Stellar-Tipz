// ── Multi-token events ────────────────────────────────────────────────────────

/// Topics : `("token", "added")`
pub fn emit_token_added(env: &Env, token: &Address, oracle: &Option<Address>) {
    env.events().publish(
        (Symbol::new(env, "token"), symbol_short!("added")),
        (token.clone(), oracle.clone()),
    );
}

/// Topics : `("token", "removed")`
pub fn emit_token_removed(env: &Env, token: &Address) {
    env.events().publish(
        (Symbol::new(env, "token"), symbol_short!("removed")),
        (1u32, token.clone()),
    );
}

/// Topics : `("tip", "token")`
pub fn emit_tip_sent_token(
    env: &Env,
    tip_id: u32,
    tipper: &Address,
    creator: &Address,
    amount: i128,
    token: &Address,
    message: &String,
    timestamp: u64,
) {
    env.events().publish(
        (symbol_short!("tip"), Symbol::new(env, "token")),
        (
            1u32,
            tip_id,
            tipper.clone(),
            creator.clone(),
            amount,
            token.clone(),
            message.clone(),
            timestamp,
        ),
    );
}

// ── Refund events ─────────────────────────────────────────────────────────────

/// Topics : `("refund", "request")`
/// Data   : `(1, tip_id: u32, tipper: Address, creator: Address, amount: i128, refund_amount: i128, non_refundable_fee: i128)`
pub fn emit_refund_requested(
    env: &Env,
    tip_id: u32,
    tipper: &Address,
    creator: &Address,
    amount: i128,
    refund_amount: i128,
    non_refundable_fee: i128,
) {
    env.events().publish(
        (Symbol::new(env, "refund"), symbol_short!("request")),
        (
            1u32,
            tip_id,
            tipper.clone(),
            creator.clone(),
            amount,
            refund_amount,
            non_refundable_fee,
        ),
    );
}

/// Topics : `("refund", "approved")`
/// Data   : `(1, tip_id: u32, creator: Address, tipper: Address, refund_amount: i128)`
pub fn emit_refund_approved(
    env: &Env,
    tip_id: u32,
    creator: &Address,
    tipper: &Address,
    refund_amount: i128,
) {
    env.events().publish(
        (Symbol::new(env, "refund"), symbol_short!("approved")),
        (1u32, tip_id, creator.clone(), tipper.clone(), refund_amount),
    );
}

/// Topics : `("refund", "rejected")`
/// Data   : `(1, tip_id: u32, creator: Address, tipper: Address)`
pub fn emit_refund_rejected(env: &Env, tip_id: u32, creator: &Address, tipper: &Address) {
    env.events().publish(
        (Symbol::new(env, "refund"), symbol_short!("rejected")),
        (1u32, tip_id, creator.clone(), tipper.clone()),
    );
}

/// Topics : `("refund", "auto")`
/// Data   : `(1, tip_id: u32, tipper: Address, refund_amount: i128)`
pub fn emit_refund_auto_approved(env: &Env, tip_id: u32, tipper: &Address, refund_amount: i128) {
    env.events().publish(
        (Symbol::new(env, "refund"), symbol_short!("auto")),
        (1u32, tip_id, tipper.clone(), refund_amount),
    );
}

/// Topics : `("refund", "expired")`
/// Data   : `(1, tip_id: u32, tipper: Address)`
pub fn emit_refund_expired(env: &Env, tip_id: u32, tipper: &Address) {
    env.events().publish(
        (Symbol::new(env, "refund"), symbol_short!("expd")),
        (1u32, tip_id, tipper.clone()),
    );
}

/// Topics : `("subscription", "failed")`
/// Data   : `(1, subscriber: Address, creator: Address)`
pub fn emit_subscription_charge_failed(env: &Env, subscriber: &Address, creator: &Address) {
    env.events().publish(
        (Symbol::new(env, "subscription"), symbol_short!("fail")),
        (1u32, subscriber.clone(), creator.clone()),
    );
}

/// Topics : `("proposal", "cancelled")`
/// Data   : `(1, proposal_id: u32, proposer: Address)`
pub fn emit_proposal_cancelled(env: &Env, proposal_id: u32, proposer: &Address) {
    env.events().publish(
        (Symbol::new(env, "proposal"), symbol_short!("canc")),
        (1u32, proposal_id, proposer.clone()),
    );
}


