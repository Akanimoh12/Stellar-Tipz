// ── Withdrawal Scheduling events ─────────────────────────────────────────────

/// Topics : `("wd", "sched")`
#[allow(dead_code)]
pub fn emit_withdrawal_scheduled(
    env: &Env,
    creator: &Address,
    id: u32,
    amount: i128,
    unlock_at: u64,
) {
    env.events().publish(
        (symbol_short!("wd"), symbol_short!("sched")),
        (1u32, creator.clone(), id, amount, unlock_at),
    );
}

/// Topics : `("wd", "exec")`
#[allow(dead_code)]
pub fn emit_withdrawal_executed(env: &Env, creator: &Address, id: u32, amount: i128) {
    env.events().publish(
        (symbol_short!("wd"), symbol_short!("exec")),
        (1u32, creator.clone(), id, amount),
    );
}

/// Topics : `("wd", "cancel")`
#[allow(dead_code)]
pub fn emit_withdrawal_cancelled(env: &Env, creator: &Address, id: u32) {
    env.events().publish(
        (symbol_short!("wd"), symbol_short!("cancel")),
        (1u32, creator.clone(), id),
    );
}

// ── Fee Distribution events ──────────────────────────────────────────────────

/// Topics : `("fee", "split")`
#[allow(dead_code)]
pub fn emit_fee_split_updated(env: &Env, ops_pct: u32, pool_pct: u32) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("split")),
        (1u32, ops_pct, pool_pct),
    );
}

/// Topics : `("fee", "dist")`
#[allow(dead_code)]
pub fn emit_fee_distributed(env: &Env, amount: i128, to_ops: bool) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("dist")),
        (1i128, amount, to_ops),
    );
}

/// Topics : `("pool", "dist")`
#[allow(dead_code)]
pub fn emit_pool_distribution(env: &Env, total_amount: i128, recipient_count: u32) {
    env.events().publish(
        (symbol_short!("pool"), symbol_short!("dist")),
        (1i128, total_amount, recipient_count),
    );
}

// ── Multi-sig events ──────────────────────────────────────────────────────────

/// Topics : `("proposal", "created")`
pub fn emit_proposal_created(
    env: &Env,
    proposal_id: u32,
    proposer: &Address,
    action: &crate::multisig::Action,
) {
    env.events().publish(
        (Symbol::new(env, "proposal"), symbol_short!("created")),
        (1u32, proposal_id, proposer.clone(), action.clone()),
    );
}

/// Topics : `("proposal", "approved")`
pub fn emit_proposal_approved(env: &Env, proposal_id: u32, approver: &Address) {
    env.events().publish(
        (Symbol::new(env, "proposal"), symbol_short!("approved")),
        (1u32, proposal_id, approver.clone()),
    );
}

/// Topics : `("proposal", "executed")`
pub fn emit_proposal_executed(env: &Env, proposal_id: u32) {
    env.events().publish(
        (Symbol::new(env, "proposal"), symbol_short!("executed")),
        (1u32, proposal_id),
    );
}

// ── Donation page events ──────────────────────────────────────────────────────

/// Topics : `("donation", "config")`
pub fn emit_donation_page_updated(env: &Env, creator: &Address) {
    env.events().publish(
        (Symbol::new(env, "donation"), symbol_short!("config")),
        (1u32, creator.clone()),
    );
}

// ── Creator min tip events ────────────────────────────────────────────────────

/// Topics : `("profile", "min_tip")`
pub fn emit_creator_min_tip_updated(env: &Env, creator: &Address, amount: Option<i128>) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("min_tip")),
        (1u32, creator.clone(), amount),
    );
}

// ── Domain verification events ────────────────────────────────────────────────

/// Topics : `("domain", "set")`
pub fn emit_domain_set(env: &Env, creator: &Address, domain: &String) {
    env.events().publish(
        (Symbol::new(env, "domain"), symbol_short!("set")),
        (creator.clone(), domain.clone()),
    );
}

/// Topics : `("domain", "verify")`
pub fn emit_domain_verified(env: &Env, creator: &Address, domain: &String) {
    env.events().publish(
        (Symbol::new(env, "domain"), symbol_short!("verify")),
        (creator.clone(), domain.clone()),
    );
}

/// Topics : `("domain", "expired")`
pub fn emit_domain_verification_expired(env: &Env, creator: &Address) {
    env.events().publish(
        (Symbol::new(env, "domain"), symbol_short!("expired")),
        (1u32, creator.clone()),
    );
}

// ── Goal events ───────────────────────────────────────────────────────────────

/// Topics : `("goal", "set")`
pub fn emit_goal_set(
    env: &Env,
    creator: &Address,
    target: i128,
    description: &String,
    deadline: u64,
) {
    env.events().publish(
        (Symbol::new(env, "goal"), symbol_short!("set")),
        (creator.clone(), target, description.clone(), deadline),
    );
}

/// Topics : `("goal", "reached")`
pub fn emit_goal_reached(env: &Env, creator: &Address, target: i128, raised: i128) {
    env.events().publish(
        (Symbol::new(env, "goal"), symbol_short!("reached")),
        (creator.clone(), target, raised),
    );
}

/// Topics : `("goal", "completed")`
/// Data   : `(creator: Address, goal_id: u64, target: i128, final_amount: i128, ledger: u32)`
pub fn emit_goal_completed(
    env: &Env,
    creator: &Address,
    goal_id: u64,
    target: i128,
    final_amount: i128,
    ledger: u32,
) {
    env.events().publish(
        (Symbol::new(env, "goal"), symbol_short!("completed")),
        (creator.clone(), goal_id, target, final_amount, ledger),
    );
}

/// Topics : `("goal", "cancel")`
pub fn emit_goal_cancelled(env: &Env, creator: &Address) {
    env.events().publish(
        (Symbol::new(env, "goal"), symbol_short!("cancel")),
        (1u32, creator.clone()),
    );
}


