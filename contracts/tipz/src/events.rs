//! Contract event definitions for the Tipz contract.
//!
//! All events are published via `env.events().publish()`.
//!
//! Events:
//! - ProfileRegistered(address, username)
//! - ProfileUpdated(address)
//! - TipSent(from, to, amount)
//! - TipsWithdrawn(address, amount, fee)
//! - CreditScoreUpdated(address, old_score, new_score)
//! - AdminChanged(old_admin, new_admin)
//! - FeeUpdated(old_fee, new_fee)

// TODO: Implement remaining event emission helpers in issue #6

use soroban_sdk::{symbol_short, Address, Env};

pub fn emit_profile_registered(env: &Env, address: &Address, username: &soroban_sdk::String) {
    env.events().publish(
        (symbol_short!("profile"), symbol_short!("reg")),
        (address.clone(), username.clone()),
    );
}

pub fn emit_tip_sent(env: &Env, from: &Address, to: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("tip"), symbol_short!("sent")),
        (from, to, amount),
    );
}
