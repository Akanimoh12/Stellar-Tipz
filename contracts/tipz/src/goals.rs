//! Goal tracking for creators.
//!
//! Allows creators to set fundraising goals (e.g., "Raise 1000 XLM for new equipment")
//! that are visible on their profile and track progress automatically as tips come in.

use soroban_sdk::{Address, Env, String, Vec};

use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::Goal;

/// Maximum number of archived goals to keep per creator
const MAX_ARCHIVED_GOALS: u32 = 10;

/// Set a new goal for a creator
pub fn set_goal(
    env: &Env,
    creator: &Address,
    target_amount: i128,
    description: &String,
    deadline: u64,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    creator.require_auth();

    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    if target_amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    if description.len() > 500 {
        return Err(ContractError::InvalidInput);
    }

    let now = env.ledger().timestamp();
    if deadline > 0 && deadline <= now {
        return Err(ContractError::InvalidInput);
    }

    // Archive current active goal if exists
    if let Some(current_goal) = storage::get_active_goal(env, creator) {
        archive_goal(env, creator, &current_goal)?;
    }

    let goal = Goal {
        creator: creator.clone(),
        target: target_amount,
        raised: 0,
        description: description.clone(),
        deadline,
        active: true,
        created_at: now,
        reached_at: None,
    };

    storage::set_active_goal(env, creator, &goal);
    storage::bump_profile_ttl(env, creator);

    events::emit_goal_set(env, creator, target_amount, description, deadline);

    Ok(())
}

/// Get the active goal for a creator
pub fn get_goal(env: &Env, creator: &Address) -> Result<Goal, ContractError> {
    storage::get_active_goal(env, creator).ok_or(ContractError::NotFound)
}

/// Cancel the active goal for a creator
pub fn cancel_goal(env: &Env, creator: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    creator.require_auth();

    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    let mut goal = storage::get_active_goal(env, creator).ok_or(ContractError::NotFound)?;

    goal.active = false;
    storage::set_active_goal(env, creator, &goal);
    storage::bump_profile_ttl(env, creator);

    events::emit_goal_cancelled(env, creator);

    Ok(())
}

/// Update goal progress when a tip is received
pub fn update_goal_progress(env: &Env, creator: &Address, tip_amount: i128) {
    if let Some(mut goal) = storage::get_active_goal(env, creator) {
        if !goal.active {
            return;
        }

        goal.raised = goal.raised.saturating_add(tip_amount);

        let reached = goal.raised >= goal.target;
        if reached && goal.reached_at.is_none() {
            goal.reached_at = Some(env.ledger().timestamp());
            events::emit_goal_reached(env, creator, goal.target, goal.raised);
            events::emit_goal_completed(
                env,
                creator,
                goal.created_at,
                goal.target,
                goal.raised,
                env.ledger().sequence(),
            );
        }

        storage::set_active_goal(env, creator, &goal);
    }
}

/// Archive a completed goal
fn archive_goal(env: &Env, creator: &Address, goal: &Goal) -> Result<(), ContractError> {
    let mut archived = storage::get_archived_goals(env, creator);

    // Keep only the most recent archived goals
    if archived.len() >= MAX_ARCHIVED_GOALS {
        archived.remove(0);
    }

    let mut archived_goal = goal.clone();
    archived_goal.active = false;
    archived.push_back(archived_goal);

    storage::set_archived_goals(env, creator, &archived);

    Ok(())
}

/// Get archived goals for a creator
pub fn get_archived_goals(env: &Env, creator: &Address) -> Vec<Goal> {
    storage::get_archived_goals(env, creator)
}
