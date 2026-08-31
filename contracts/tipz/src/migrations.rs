//! Versioned storage migration framework for the Tipz smart contract.
//!
//! Provides a batchable, idempotent migration harness mapping `from_version -> to_version`
//! state transformations. Refuses version downgrades and ensures atomic contract version updates.

use soroban_sdk::{Address, Env};

use crate::admin::require_admin;
use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::MigrationState;

/// Execute or resume a versioned storage migration to `target_version`.
///
/// Admin only. Batchable by `batch_size`.
pub fn migrate(
    env: &Env,
    caller: &Address,
    target_version: u32,
    batch_size: u32,
) -> Result<MigrationState, ContractError> {
    storage::extend_instance_ttl(env);
    require_admin(env, caller)?;

    let current_version = storage::get_version(env);

    if target_version < current_version {
        return Err(ContractError::MigrationDowngradeRejected);
    }

    if target_version == current_version {
        let state = MigrationState {
            from_version: current_version,
            target_version,
            current_step: current_version,
            processed_count: 0,
            is_completed: true,
        };
        storage::remove_migration_state(env);
        return Ok(state);
    }

    let mut state = match storage::get_migration_state(env) {
        Some(existing) => {
            if existing.target_version != target_version {
                return Err(ContractError::InvalidMigrationVersion);
            }
            existing
        }
        None => {
            events::emit_migration_started(env, current_version, target_version);
            MigrationState {
                from_version: current_version,
                target_version,
                current_step: current_version + 1,
                processed_count: 0,
                is_completed: false,
            }
        }
    };

    let effective_batch = if batch_size == 0 { 10 } else { batch_size };

    // Process migration steps sequentially from from_version + 1 up to target_version
    while state.current_step <= target_version {
        let step_done =
            execute_migration_step(env, state.current_step, &mut state, effective_batch)?;
        if !step_done {
            // Batch limit reached for current step; persist state for next resumption call.
            storage::set_migration_state(env, &state);
            return Ok(state);
        }
        state.current_step += 1;
        state.processed_count = 0;
    }

    state.is_completed = true;
    storage::set_version(env, target_version);
    storage::remove_migration_state(env);
    events::emit_migration_completed(env, current_version, target_version);

    Ok(state)
}

/// Execute a single migration step (e.g. step 4 converts v3 -> v4 schema).
fn execute_migration_step(
    _env: &Env,
    step: u32,
    state: &mut MigrationState,
    batch_size: u32,
) -> Result<bool, ContractError> {
    match step {
        4 => {
            // Worked example migration step: v3 -> v4 batch transformation.
            // Simulates processing 5 items per step; finishes when processed >= 5.
            state.processed_count += batch_size;
            if state.processed_count >= 5 {
                Ok(true)
            } else {
                Ok(false)
            }
        }
        _ => {
            // Generic step transformation complete
            state.processed_count += batch_size;
            Ok(true)
        }
    }
}
