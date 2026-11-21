// ── Fee events ────────────────────────────────────────────────────────────────

/// Topics : `("fee", "updated")`
/// Data   : `(1, old_bps: u32, new_bps: u32)`
pub fn emit_fee_updated(env: &Env, old_bps: u32, new_bps: u32) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("updated")),
        (1u32, old_bps, new_bps),
    );
}

/// Topics : `("fee", "proposed")`
/// Data   : `(1, old_bps: u32, new_bps: u32, effective_ledger: u32, immediate: bool)`
pub fn emit_fee_change_proposed(
    env: &Env,
    old_bps: u32,
    new_bps: u32,
    effective_ledger: u32,
    immediate: bool,
) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("propose")),
        (1u32, old_bps, new_bps, effective_ledger, immediate),
    );
}

/// Topics : `("fee", "applied")`
/// Data   : `(1, old_bps: u32, new_bps: u32)`
pub fn emit_fee_change_applied(env: &Env, old_bps: u32, new_bps: u32) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("apply")),
        (1u32, old_bps, new_bps),
    );
}

/// Topics : `("fee", "canceled")`
/// Data   : `(1, actor: Address, new_bps: u32)`
pub fn emit_fee_change_cancelled(env: &Env, actor: &Address, new_bps: u32) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("cancel")),
        (1u32, actor.clone(), new_bps),
    );
}

/// Topics : `("fee", "collector")`
/// Data   : `(1, new_collector: Address)`
pub fn emit_fee_collector_updated(env: &Env, new_collector: &Address) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("collector")),
        (1u32, new_collector.clone()),
    );
}

/// Topics : `("fee", "collected")`
/// Data   : `(1, operation: String, payer: Address, gross: i128, fee: i128, net: i128, fee_bps: u32)`
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
pub fn emit_contract_paused(env: &Env, admin: &Address, flag: crate::types::PauseFlag) {
    env.events().publish(
        (symbol_short!("contract"), symbol_short!("paused")),
        (1u32, admin.clone(), flag as u32),
    );
}
pub fn emit_contract_unpaused(env: &Env, admin: &Address, flag: crate::types::PauseFlag) {
    env.events().publish(
        (symbol_short!("contract"), symbol_short!("unpaused")),
        (1u32, admin.clone(), flag as u32),
    );
}

/// Topics : `("breaker", "tripped")`
/// Data   : `(attempted_amount, rolling_total, threshold)`
pub fn emit_circuit_breaker_tripped(
    env: &Env,
    attempted_amount: i128,
    rolling_total: i128,
    threshold: i128,
) {
    env.events().publish(
        (symbol_short!("breaker"), symbol_short!("tripped")),
        (attempted_amount, rolling_total, threshold),
    );
}

pub fn emit_emergency_withdrawal(env: &Env, creator: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("creator"), symbol_short!("emerg_wdr")),
        (1u32, creator.clone(), amount),
    );
}

pub fn emit_migration_started(env: &Env, from_version: u32, target_version: u32) {
    env.events().publish(
        (symbol_short!("migrate"), symbol_short!("started")),
        (1u32, from_version, target_version),
    );
}

pub fn emit_migration_completed(env: &Env, from_version: u32, target_version: u32) {
    env.events().publish(
        (symbol_short!("migrate"), symbol_short!("completed")),
        (1u32, from_version, target_version),
    );
}
pub fn emit_min_tip_amount_updated(env: &Env, old_min: i128, new_min: i128) {
    env.events().publish(
        (symbol_short!("tip"), symbol_short!("min")),
        (1i128, old_min, new_min),
    );
}
pub fn emit_min_withdrawal_amount_updated(env: &Env, old_min: i128, new_min: i128) {
    env.events().publish(
        (symbol_short!("withdraw"), symbol_short!("min")),
        (1i128, old_min, new_min),
    );
}

// ── Batch events ──────────────────────────────────────────────────────────────


