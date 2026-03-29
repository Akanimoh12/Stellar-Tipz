//! Event emission helpers for the Tipz contract.
//!
//! Every on-chain action that mutates meaningful state emits an event so that
//! off-chain indexers can follow contract activity without replaying every
//! transaction.
//!
//! ## Naming convention
//! Topic tuple  → `(Symbol, Symbol)`   – identifies the event type
//! Data tuple   → `(field, field, …)`  – the payload

use soroban_sdk::{symbol_short, Address, Env, String, Vec};

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

// ── Tip events ────────────────────────────────────────────────────────────────

/// Topics : `("tip", "sent")`
/// Data   : `(id: u32, tipper: Address, creator: Address, amount: i128, message: String, timestamp: u64)`
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
/// Data   : `(creator: Address,)`
pub fn emit_x_metrics_batch_skipped(env: &Env, creator: &Address) {
    env.events().publish(
        (symbol_short!("batch"), symbol_short!("skipped")),
        (creator.clone(),),
    );
}

/// Topics : `("batch", "done")`
/// Data   : `(processed: u32, skipped: u32, skipped_addrs: Vec<Address>)`
pub fn emit_x_metrics_batch_completed(
    env: &Env,
    processed: u32,
    skipped: u32,
    skipped_addresses: Vec<Address>,
) {
    env.events().publish(
        (symbol_short!("batch"), symbol_short!("done")),
        (processed, skipped, skipped_addresses),
    );
}
