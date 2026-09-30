//! Contract-level withdrawal circuit breaker.
//!
//! The breaker tracks gross withdrawal volume in a fixed number of buckets.
//! When the configured rolling-window threshold would be exceeded, it pauses
//! the contract before any withdrawal transfer occurs.

use soroban_sdk::{Env, String};

use crate::errors::ContractError;
use crate::storage::{self, MAX_CIRCUIT_BREAKER_BUCKETS};
use crate::types::{CircuitBreakerConfig, CircuitBreakerStatus};

pub fn configure(
    env: &Env,
    caller: &soroban_sdk::Address,
    enabled: bool,
    threshold: i128,
    window_secs: u64,
    bucket_count: u32,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, caller)?;
    crate::admin::require_no_multisig(env)?;

    if threshold < 0 {
        return Err(ContractError::InvalidAmount);
    }
    if enabled && (threshold == 0 || window_secs == 0) {
        return Err(ContractError::InvalidInput);
    }
    if bucket_count == 0 || bucket_count > MAX_CIRCUIT_BREAKER_BUCKETS {
        return Err(ContractError::InvalidInput);
    }

    let config = CircuitBreakerConfig {
        enabled,
        threshold,
        window_secs,
        bucket_count,
    };
    storage::set_circuit_breaker_config(env, &config);
    storage::reset_circuit_breaker_status(env, bucket_count);
    crate::admin::log_admin_action(
        env,
        caller,
        soroban_sdk::Symbol::new(env, "set_circuit_breaker"),
        String::from_str(env, ""),
        crate::admin::i128_to_string(env, threshold),
    );
    Ok(())
}

pub fn reset(env: &Env, caller: &soroban_sdk::Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, caller)?;
    crate::admin::require_no_multisig(env)?;

    let config = storage::get_circuit_breaker_config(env);
    let status = storage::get_circuit_breaker_status(env);
    storage::reset_circuit_breaker_status(env, config.bucket_count);
    if status.tripped {
        storage::set_paused(env, false);
        crate::events::emit_contract_unpaused(env, caller);
    }
    crate::admin::log_admin_action(
        env,
        caller,
        soroban_sdk::Symbol::new(env, "reset_circuit_breaker"),
        String::from_str(env, "tripped"),
        String::from_str(env, "reset"),
    );
    Ok(())
}

pub fn get_config(env: &Env) -> CircuitBreakerConfig {
    storage::get_circuit_breaker_config(env)
}

pub fn get_status(env: &Env) -> CircuitBreakerStatus {
    storage::get_circuit_breaker_status(env)
}

pub fn record_withdrawal_or_trip(env: &Env, amount: i128) -> Result<(), ContractError> {
    let config = storage::get_circuit_breaker_config(env);
    if !config.enabled {
        return Ok(());
    }

    let now = env.ledger().timestamp();
    let bucket_secs = bucket_secs(&config)?;
    let mut status = normalize_status(env, &config, storage::get_circuit_breaker_status(env));
    let current_bucket_start = (now / bucket_secs) * bucket_secs;
    let current_index = ((now / bucket_secs) % config.bucket_count as u64) as u32;

    if status.bucket_starts.get(current_index).unwrap_or(0) != current_bucket_start {
        status
            .bucket_starts
            .set(current_index, current_bucket_start);
        status.bucket_volumes.set(current_index, 0);
    }

    let cutoff = now.saturating_sub(config.window_secs);
    let mut rolling_total = amount;
    for index in 0..config.bucket_count {
        let bucket_start = status.bucket_starts.get(index).unwrap_or(0);
        if bucket_start >= cutoff {
            rolling_total = rolling_total
                .checked_add(status.bucket_volumes.get(index).unwrap_or(0))
                .ok_or(ContractError::OverflowError)?;
        }
    }

    if rolling_total > config.threshold {
        status.tripped = true;
        status.tripped_at = Some(now);
        storage::set_circuit_breaker_status(env, &status);
        storage::set_paused(env, true);
        crate::events::emit_circuit_breaker_tripped(env, amount, rolling_total, config.threshold);
        return Err(ContractError::ContractPaused);
    }

    let current_volume = status.bucket_volumes.get(current_index).unwrap_or(0);
    status.bucket_volumes.set(
        current_index,
        current_volume
            .checked_add(amount)
            .ok_or(ContractError::OverflowError)?,
    );
    storage::set_circuit_breaker_status(env, &status);
    Ok(())
}

fn bucket_secs(config: &CircuitBreakerConfig) -> Result<u64, ContractError> {
    if config.bucket_count == 0 || config.bucket_count > MAX_CIRCUIT_BREAKER_BUCKETS {
        return Err(ContractError::InvalidInput);
    }
    if config.window_secs == 0 {
        return Err(ContractError::InvalidInput);
    }
    Ok((config.window_secs / config.bucket_count as u64).max(1))
}

fn normalize_status(
    env: &Env,
    config: &CircuitBreakerConfig,
    mut status: CircuitBreakerStatus,
) -> CircuitBreakerStatus {
    let count = config.bucket_count.min(MAX_CIRCUIT_BREAKER_BUCKETS).max(1);
    while status.bucket_starts.len() < count {
        status.bucket_starts.push_back(0);
    }
    while status.bucket_volumes.len() < count {
        status.bucket_volumes.push_back(0);
    }
    while status.bucket_starts.len() > count {
        status.bucket_starts.pop_back();
    }
    while status.bucket_volumes.len() > count {
        status.bucket_volumes.pop_back();
    }
    if status.bucket_starts.len() == 0 || status.bucket_volumes.len() == 0 {
        storage::reset_circuit_breaker_status(env, count);
        return storage::get_circuit_breaker_status(env);
    }
    status
}
