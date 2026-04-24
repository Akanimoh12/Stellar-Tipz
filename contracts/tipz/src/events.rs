//! Event emission helpers for the Tipz contract.
//!
//! Every on-chain action that mutates meaningful state emits an event so that
//! off-chain indexers can follow contract activity without replaying every
//! transaction.
//!
//! ## Naming convention
//! Topic tuple  → `(Symbol, Symbol)`   – identifies the event type
//! Data tuple   → `(field, field, …)`  – the payload

use soroban_sdk::{symbol_short, Address, Env, String, Symbol, Vec};

use crate::types::BatchSkip;

// ── Profile events ────────────────────────────────────────────────────────────

/// Topics : `("profile", "registered")`
/// Data   : `(owner: Address, username: String)`
pub fn emit_profile_registered(env: &Env, owner: &Address, username: &String) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("register")),
        (owner.clone(), username.clone()),
    );
}

/// Topics : `("profile", "updated")`
/// Data   : `(owner: Address,)`
pub fn emit_profile_updated(env: &Env, owner: &Address) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("updated")),
        (owner.clone(),),
    );
}

/// Topics : `("profile", "deregist")`
/// Data   : `(owner: Address, username: String)`
pub fn emit_profile_deregistered(env: &Env, owner: &Address, username: &String) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("deregist")),
        (owner.clone(), username.clone()),
    );
}

/// Topics : `("profile", "deact")` — temporary deactivation (data retained).
pub fn emit_profile_deactivated(env: &Env, creator: &Address, actor: &Address) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("deact")),
        (creator.clone(), actor.clone()),
    );
}

/// Topics : `("profile", "react")` — profile reactivated.
pub fn emit_profile_reactivated(env: &Env, creator: &Address, actor: &Address) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("react")),
        (creator.clone(), actor.clone()),
    );
}

// ── Tip events ────────────────────────────────────────────────────────────────

/// Topics : `("tip", "sent")`
/// Data   : `(id: u32, tipper: Address, creator: Address, amount: i128, message: String, timestamp: u64, is_anonymous: bool)`
///
/// All tip fields are included so that off-chain indexers can reconstruct the
/// complete tip history from events alone, without relying on temporary storage
/// which expires after ~7 days.
pub fn emit_tip_sent(
    env: &Env,
    tip_id: u32,
    tipper: &Address,
    creator: &Address,
    amount: i128,
    message: &String,
    timestamp: u64,
    is_anonymous: bool,
) {
    env.events().publish(
        (symbol_short!("tip"), symbol_short!("sent")),
        (
            tip_id,
            tipper.clone(),
            creator.clone(),
            amount,
            message.clone(),
            timestamp,
            is_anonymous,
        ),
    );
}

/// Topics : `("tip", "withdrawn")`
/// Data   : `(creator: Address, amount: i128, fee: i128)`
pub fn emit_tips_withdrawn(env: &Env, creator: &Address, amount: i128, fee: i128) {
    env.events().publish(
        (symbol_short!("tip"), symbol_short!("withdrawn")),
        (creator.clone(), amount, fee),
    );
}

// ── Credit score events ───────────────────────────────────────────────────────

/// Topics : `("credit", "updated")`
/// Data   : `(creator: Address, old_score: u32, new_score: u32)`
pub fn emit_credit_score_updated(env: &Env, creator: &Address, old_score: u32, new_score: u32) {
    env.events().publish(
        (symbol_short!("credit"), symbol_short!("updated")),
        (creator.clone(), old_score, new_score),
    );
}

// ── Admin events ──────────────────────────────────────────────────────────────

/// Topics : `("admin", "changed")`
/// Data   : `(old_admin: Address, new_admin: Address)`
pub fn emit_admin_changed(env: &Env, old_admin: &Address, new_admin: &Address) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("changed")),
        (old_admin.clone(), new_admin.clone()),
    );
}

/// Emit an `AdminProposed` event when the current admin proposes a new admin.
///
/// Topic: ("admin", "proposed")
pub fn emit_admin_proposed(env: &Env, current_admin: &Address, proposed_admin: &Address) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("proposed")),
        (current_admin.clone(), proposed_admin.clone()),
    );
}

/// Emit an `AdminAccepted` event when the proposed admin accepts the role.
///
/// Topic: ("admin", "accepted")
pub fn emit_admin_accepted(env: &Env, new_admin: &Address) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("accepted")),
        new_admin.clone(),
    );
}

/// Emit an `AdminProposalCancelled` event when the current admin cancels a pending proposal.
///
/// Topic: ("admin", "canceled")
pub fn emit_admin_proposal_cancelled(env: &Env, current_admin: &Address) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("canceled")),
        current_admin.clone(),
    );
}

/// Topics : `("admin", "chgprop")` — time-locked admin rotation proposed.
/// Data : `(current_admin, new_admin, confirmable_after)`
pub fn emit_admin_change_proposed(
    env: &Env,
    current_admin: &Address,
    new_admin: &Address,
    confirmable_after: u64,
) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("chgprop")),
        (
            current_admin.clone(),
            new_admin.clone(),
            confirmable_after,
        ),
    );
}

/// Topics : `("admin", "chgconf")` — time-locked admin rotation completed.
/// Data : `(old_admin, new_admin)`
pub fn emit_admin_change_confirmed(env: &Env, old_admin: &Address, new_admin: &Address) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("chgconf")),
        (old_admin.clone(), new_admin.clone()),
    );
}

// ── Fee events ────────────────────────────────────────────────────────────────

/// Topics : `("fee", "updated")`
/// Data   : `(old_bps: u32, new_bps: u32)`
pub fn emit_fee_updated(env: &Env, old_bps: u32, new_bps: u32) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("updated")),
        (old_bps, new_bps),
    );
}

/// Topics : `("fee", "collector")`
/// Data   : `(new_collector: Address,)`
pub fn emit_fee_collector_updated(env: &Env, new_collector: &Address) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("collector")),
        (new_collector.clone(),),
    );
}
pub fn emit_contract_paused(env: &Env, admin: &Address) {
    env.events().publish(
        (symbol_short!("contract"), symbol_short!("paused")),
        (admin.clone(),),
    );
}
pub fn emit_contract_unpaused(env: &Env, admin: &Address) {
    env.events().publish(
        (symbol_short!("contract"), symbol_short!("unpaused")),
        (admin.clone(),),
    );
}
pub fn emit_min_tip_amount_updated(env: &Env, old_min: i128, new_min: i128) {
    env.events().publish(
        (symbol_short!("tip"), symbol_short!("min")),
        (old_min, new_min),
    );
}

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
        (creator.clone(), reason),
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

/// Topics : `("verification", "requested")`
/// Data   : `(creator: Address, verification_type: VerificationType)`
pub fn emit_verification_requested(
    env: &Env,
    creator: &Address,
    verification_type: &crate::types::VerificationType,
) {
    env.events().publish(
        (Symbol::new(env, "verification"), symbol_short!("requested")),
        (creator.clone(), verification_type.clone()),
    );
}

/// Topics : `("verification", "approved")`
/// Data   : `(creator: Address, verification_type: VerificationType)`
pub fn emit_verification_approved(
    env: &Env,
    creator: &Address,
    verification_type: &crate::types::VerificationType,
) {
    env.events().publish(
        (Symbol::new(env, "verification"), symbol_short!("approved")),
        (creator.clone(), verification_type.clone()),
    );
}

/// Topics : `("verification", "revoked")`
/// Data   : `(creator: Address,)`
pub fn emit_verification_revoked(env: &Env, creator: &Address) {
    env.events().publish(
        (Symbol::new(env, "verification"), symbol_short!("revoked")),
        (creator.clone(),),
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
) {
    env.events().publish(
        (symbol_short!("sub"), symbol_short!("created")),
        (subscriber.clone(), creator.clone(), amount, interval_days),
    );
}

/// Topics : `("sub", "cancel")`
pub fn emit_subscription_cancelled(env: &Env, subscriber: &Address, creator: &Address) {
    env.events().publish(
        (symbol_short!("sub"), symbol_short!("cancel")),
        (subscriber.clone(), creator.clone()),
    );
}

/// Topics : `("sub", "exec")`
pub fn emit_subscription_executed(
    env: &Env,
    subscriber: &Address,
    creator: &Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("sub"), symbol_short!("exec")),
        (subscriber.clone(), creator.clone(), amount),
    );
}

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
        (creator.clone(), id, amount, unlock_at),
    );
}

/// Topics : `("wd", "exec")`
#[allow(dead_code)]
pub fn emit_withdrawal_executed(env: &Env, creator: &Address, id: u32, amount: i128) {
    env.events().publish(
        (symbol_short!("wd"), symbol_short!("exec")),
        (creator.clone(), id, amount),
    );
}

/// Topics : `("wd", "cancel")`
#[allow(dead_code)]
pub fn emit_withdrawal_cancelled(env: &Env, creator: &Address, id: u32) {
    env.events().publish(
        (symbol_short!("wd"), symbol_short!("cancel")),
        (creator.clone(), id),
    );
}

// ── Fee Distribution events ──────────────────────────────────────────────────

/// Topics : `("fee", "split")`
#[allow(dead_code)]
pub fn emit_fee_split_updated(env: &Env, ops_pct: u32, pool_pct: u32) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("split")),
        (ops_pct, pool_pct),
    );
}

/// Topics : `("fee", "dist")`
#[allow(dead_code)]
pub fn emit_fee_distributed(env: &Env, amount: i128, to_ops: bool) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("dist")),
        (amount, to_ops),
    );
}

/// Topics : `("pool", "dist")`
#[allow(dead_code)]
pub fn emit_pool_distribution(env: &Env, total_amount: i128, recipient_count: u32) {
    env.events().publish(
        (symbol_short!("pool"), symbol_short!("dist")),
        (total_amount, recipient_count),
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
        (proposal_id, proposer.clone(), action.clone()),
    );
}

/// Topics : `("proposal", "approved")`
pub fn emit_proposal_approved(env: &Env, proposal_id: u32, approver: &Address) {
    env.events().publish(
        (Symbol::new(env, "proposal"), symbol_short!("approved")),
        (proposal_id, approver.clone()),
    );
}

/// Topics : `("proposal", "executed")`
pub fn emit_proposal_executed(env: &Env, proposal_id: u32) {
    env.events().publish(
        (Symbol::new(env, "proposal"), symbol_short!("executed")),
        proposal_id,
    );
}

// ── Donation page events ──────────────────────────────────────────────────────

/// Topics : `("donation", "config")`
pub fn emit_donation_page_updated(env: &Env, creator: &Address) {
    env.events().publish(
        (Symbol::new(env, "donation"), symbol_short!("config")),
        creator.clone(),
    );
}
