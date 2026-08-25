//! Event emission helpers for the Tipz contract.
//!
//! Every on-chain action that mutates meaningful state emits an event so that
//! off-chain indexers can follow contract activity without replaying every
//! transaction.
//!
//! ## Naming convention
//! Topic tuple  → `(Symbol, Symbol)`   – identifies the event type
//! Data tuple   → `(field, field, …)`  – the payload

use soroban_sdk::{symbol_short, Address, BytesN, Env, String, Symbol, Vec};

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
/// Data   : `(id: u32, tipper: Address, creator: Address, amount: i128, message: String, timestamp: u64, is_anonymous: bool, is_encrypted: bool)`
///
/// All tip fields are included so that off-chain indexers can reconstruct the
/// complete tip history from events alone, without relying on temporary storage
/// which expires after ~7 days.
#[allow(clippy::too_many_arguments)]
pub fn emit_tipper_blocked(env: &Env, creator: &Address, tipper: &Address) {
    env.events().publish(
        (symbol_short!("tipper"), symbol_short!("blocked")),
        (creator.clone(), tipper.clone()),
    );
}

pub fn emit_tipper_unblocked(env: &Env, creator: &Address, tipper: &Address) {
    env.events().publish(
        (symbol_short!("tipper"), symbol_short!("unblocked")),
        (creator.clone(), tipper.clone()),
    );
}

pub fn emit_tip_sent(
    env: &Env,
    tip_id: u32,
    tipper: &Address,
    creator: &Address,
    amount: i128,
    message: &String,
    timestamp: u64,
    is_anonymous: bool,
    is_encrypted: bool,
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
            is_encrypted,
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

/// Topics : `("streak", "milestone")`
/// Data   : `(supporter: Address, creator: Address, current: u32)`
pub fn emit_streak_milestone(env: &Env, supporter: &Address, creator: &Address, current: u32) {
    env.events().publish(
        (symbol_short!("streak"), symbol_short!("milestone")),
        (supporter.clone(), creator.clone(), current),
    );
}

// ── Admin events ──────────────────────────────────────────────────────────────

/// Emit an `AdminAuditLog` event mirroring an admin audit entry for indexers.
///
/// Topics : `("admin", "audit")`
/// Data   : `(id, actor, action_kind, before_value, after_value, ledger_sequence, timestamp)`
pub fn emit_admin_audit_log(env: &Env, entry: &crate::types::AdminAuditEntry) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("audit")),
        entry.clone(),
    );
}

pub fn emit_scheduled_tip_created(
    env: &Env,
    id: u32,
    sender: &Address,
    creator: &Address,
    amount: i128,
    deliver_at: u64,
) {
    env.events().publish(
        (symbol_short!("sch_tip"), symbol_short!("created")),
        (id, sender.clone(), creator.clone(), amount, deliver_at),
    );
}

pub fn emit_scheduled_tip_delivered(env: &Env, id: u32, creator: &Address) {
    env.events().publish(
        (symbol_short!("sch_tip"), symbol_short!("deliver")),
        (id, creator.clone()),
    );
}

pub fn emit_scheduled_tip_cancelled(
    env: &Env,
    id: u32,
    sender: &Address,
    refund_amount: i128,
    cancellation_fee: i128,
) {
    env.events().publish(
        (symbol_short!("sch_tip"), symbol_short!("cancel")),
        (id, sender.clone(), refund_amount, cancellation_fee),
    );
}

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
        (current_admin.clone(), new_admin.clone(), confirmable_after),
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

pub fn emit_upgrade_proposed(env: &Env, wasm_hash: &BytesN<32>) {
    env.events()
        .publish((symbol_short!("upgrade"), symbol_short!("proposed")), wasm_hash.clone());
}

pub fn emit_upgrade_cancelled(env: &Env, admin: &Address) {
    env.events()
        .publish((symbol_short!("upgrade"), symbol_short!("canceled")), admin.clone());
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

/// Topics : `("fee", "collected")`
/// Data   : `(operation: String, payer: Address, gross: i128, fee: i128, net: i128, fee_bps: u32)`
///
/// Emitted for each fee-bearing operation (withdrawals, refunds, etc.).
/// Captures the fee_bps at time of charge so historical events are self-describing.
pub fn emit_fee_collected(
    env: &Env,
    operation: &str,
    payer: &Address,
    gross: i128,
    fee: i128,
    net: i128,
    fee_bps: u32,
) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("collected")),
        (
            String::from_str(env, operation),
            payer.clone(),
            gross,
            fee,
            net,
            fee_bps,
        ),
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

pub fn emit_emergency_withdrawal(env: &Env, creator: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("creator"), symbol_short!("emerg_wdr")),
        (creator.clone(), amount),
    );
}

pub fn emit_migration_started(env: &Env, from_version: u32, target_version: u32) {
    env.events().publish(
        (symbol_short!("migrate"), symbol_short!("started")),
        (from_version, target_version),
    );
}

pub fn emit_migration_completed(env: &Env, from_version: u32, target_version: u32) {
    env.events().publish(
        (symbol_short!("migrate"), symbol_short!("completed")),
        (from_version, target_version),
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
        (creator.clone(), verification_type.clone()),
    );
}

/// Topics : `("verify", "revoked")`
/// Data   : `(creator: Address,)`
pub fn emit_verification_revoked(env: &Env, creator: &Address) {
    env.events().publish(
        (symbol_short!("verify"), symbol_short!("revoked")),
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

// ── Creator min tip events ────────────────────────────────────────────────────

/// Topics : `("profile", "min_tip")`
pub fn emit_creator_min_tip_updated(env: &Env, creator: &Address, amount: Option<i128>) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("min_tip")),
        (creator.clone(), amount),
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
        creator.clone(),
    );
}

// ── Goal events ───────────────────────────────────────────────────────────────

/// Topics : `("goal", "set")`
pub fn emit_goal_set(env: &Env, creator: &Address, target: i128, description: &String, deadline: u64) {
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
        creator.clone(),
    );
}

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
        token.clone(),
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
/// Data   : `(tip_id: u32, tipper: Address, creator: Address, amount: i128, refund_amount: i128, non_refundable_fee: i128)`
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
/// Data   : `(tip_id: u32, creator: Address, tipper: Address, refund_amount: i128)`
pub fn emit_refund_approved(
    env: &Env,
    tip_id: u32,
    creator: &Address,
    tipper: &Address,
    refund_amount: i128,
) {
    env.events().publish(
        (Symbol::new(env, "refund"), symbol_short!("approved")),
        (tip_id, creator.clone(), tipper.clone(), refund_amount),
    );
}

/// Topics : `("refund", "rejected")`
/// Data   : `(tip_id: u32, creator: Address, tipper: Address)`
pub fn emit_refund_rejected(env: &Env, tip_id: u32, creator: &Address, tipper: &Address) {
    env.events().publish(
        (Symbol::new(env, "refund"), symbol_short!("rejected")),
        (tip_id, creator.clone(), tipper.clone()),
    );
}

/// Topics : `("refund", "auto")`
/// Data   : `(tip_id: u32, tipper: Address, refund_amount: i128)`
pub fn emit_refund_auto_approved(env: &Env, tip_id: u32, tipper: &Address, refund_amount: i128) {
    env.events().publish(
        (Symbol::new(env, "refund"), symbol_short!("auto")),
        (tip_id, tipper.clone(), refund_amount),
    );
}

/// Topics : `("refund", "expired")`
/// Data   : `(tip_id: u32, tipper: Address)`
pub fn emit_refund_expired(env: &Env, tip_id: u32, tipper: &Address) {
    env.events().publish(
        (Symbol::new(env, "refund"), symbol_short!("expd")),
        (tip_id, tipper.clone()),
    );
}

/// Topics : `("subscription", "failed")`
/// Data   : `(subscriber: Address, creator: Address)`
pub fn emit_subscription_charge_failed(env: &Env, subscriber: &Address, creator: &Address) {
    env.events().publish(
        (Symbol::new(env, "subscription"), symbol_short!("fail")),
        (subscriber.clone(), creator.clone()),
    );
}

/// Topics : `("proposal", "cancelled")`
/// Data   : `(proposal_id: u32, proposer: Address)`
pub fn emit_proposal_cancelled(env: &Env, proposal_id: u32, proposer: &Address) {
    env.events().publish(
        (Symbol::new(env, "proposal"), symbol_short!("canc")),
        (proposal_id, proposer.clone()),
    );
}
