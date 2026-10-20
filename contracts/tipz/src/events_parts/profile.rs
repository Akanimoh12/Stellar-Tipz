pub fn emit_profile_registered(env: &Env, owner: &Address, username: &String) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("register")),
        (1u32, owner.clone(), username.clone()),
    );
}

/// Topics : `("profile", "updated")`
/// Data   : `(1, owner: Address)` — version 1
pub fn emit_profile_updated(env: &Env, owner: &Address) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("updated")),
        (1u32, owner.clone()),
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
        (1u32, creator.clone(), actor.clone()),
    );
}

/// Topics : `("profile", "react")` — profile reactivated.
pub fn emit_profile_reactivated(env: &Env, creator: &Address, actor: &Address) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("react")),
        (1u32, creator.clone(), actor.clone()),
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
        (1u32, creator.clone(), tipper.clone()),
    );
}

pub fn emit_tipper_unblocked(env: &Env, creator: &Address, tipper: &Address) {
    env.events().publish(
        (symbol_short!("tipper"), symbol_short!("unblocked")),
        (1u32, creator.clone(), tipper.clone()),
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
            1u32,
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
        (1u32, creator.clone(), amount, fee),
    );
}


