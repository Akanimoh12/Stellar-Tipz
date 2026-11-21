// ── Admin events ──────────────────────────────────────────────────────────────

/// Emit an `AdminAuditLog` event mirroring an admin audit entry for indexers.
///
/// Topics : `("admin", "audit")`
/// Data   : `(1, id, actor, action_kind, before_value, after_value, ledger_sequence, timestamp)`
pub fn emit_admin_audit_log(env: &Env, entry: &crate::types::AdminAuditEntry) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("audit")),
        (
            1u32,
            entry.id,
            entry.actor.clone(),
            entry.action_kind,
            entry.before_value.clone(),
            entry.after_value.clone(),
            entry.ledger_sequence,
            entry.timestamp,
        ),
    );
}

/// Topics : `("admin", "changed")`
/// Data   : `(1, old_admin: Address, new_admin: Address)`
pub fn emit_admin_changed(env: &Env, old_admin: &Address, new_admin: &Address) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("changed")),
        (1u32, old_admin.clone(), new_admin.clone()),
    );
}

/// Emit an `AdminProposed` event when the current admin proposes a new admin.
///
/// Topic: ("admin", "proposed")
pub fn emit_admin_proposed(env: &Env, current_admin: &Address, proposed_admin: &Address) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("proposed")),
        (1u32, current_admin.clone(), proposed_admin.clone()),
    );
}

/// Emit an `AdminAccepted` event when the proposed admin accepts the role.
///
/// Topic: ("admin", "accepted")
pub fn emit_admin_accepted(env: &Env, new_admin: &Address) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("accepted")),
        (1u32, new_admin.clone()),
    );
}

/// Emit an `AdminProposalCancelled` event when the current admin cancels a pending proposal.
///
/// Topic: ("admin", "canceled")
pub fn emit_admin_proposal_cancelled(env: &Env, current_admin: &Address) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("canceled")),
        (1u32, current_admin.clone()),
    );
}

/// Topics : `("admin", "chgprop")` — time-locked admin rotation proposed.
/// Data : `(1, current_admin, new_admin, confirmable_after)`
pub fn emit_admin_change_proposed(
    env: &Env,
    current_admin: &Address,
    new_admin: &Address,
    confirmable_after: u64,
) {
    env.events().publish(
        (symbol_short!("admin"), symbol_short!("chgprop")),
        (
            1u32,
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
        (1u32, old_admin.clone(), new_admin.clone()),
    );
}

pub fn emit_upgrade_proposed(env: &Env, wasm_hash: &BytesN<32>) {
    env.events().publish(
        (symbol_short!("upgrade"), symbol_short!("proposed")),
        (1u32, wasm_hash.clone()),
    );
}

pub fn emit_upgrade_cancelled(env: &Env, admin: &Address) {
    env.events().publish(
        (symbol_short!("upgrade"), symbol_short!("canceled")),
        (1u32, admin.clone()),
    );
}

