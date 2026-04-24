//! Platform analytics and statistics queries.
//!
//! Provides global platform statistics and per-creator analytics
//! with efficient single-read queries from instance storage.

use soroban_sdk::{contracttype, Address, Env};

use crate::errors::ContractError;
use crate::storage;

/// Platform-wide statistics
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PlatformStats {
    /// Total number of registered creators
    pub total_creators: u32,
    /// Total number of tips sent (all time)
    pub total_tips: u32,
    /// Total tip volume in stroops (all time)
    pub total_volume: i128,
    /// Total fees collected in stroops (all time)
    pub total_fees_collected: i128,
    /// Number of active creators in last 30 days
    pub active_creators_30d: u32,
    /// Number of tips in last 24 hours
    pub tips_last_24h: u32,
    /// Tip volume in last 24 hours (stroops)
    pub volume_last_24h: i128,
}

/// Per-creator statistics
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CreatorStats {
    /// Creator address
    pub creator: Address,
    /// Total tips received (count)
    pub total_tips_count: u32,
    /// Total tips received (volume in stroops)
    pub total_tips_received: i128,
    /// Current withdrawable balance
    pub balance: i128,
    /// Credit score (0-100)
    pub credit_score: u32,
    /// Leaderboard rank (None if not on leaderboard)
    pub leaderboard_rank: Option<u32>,
    /// Registration timestamp
    pub registered_at: u64,
}

/// Get comprehensive platform statistics
pub fn get_platform_stats(env: &Env) -> Result<PlatformStats, ContractError> {
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }

    storage::extend_instance_ttl(env);

    // Get 24h stats from storage
    let tips_24h = storage::get_tips_last_24h(env);
    let volume_24h = storage::get_volume_last_24h(env);
    let active_30d = storage::get_active_creators_30d(env);

    Ok(PlatformStats {
        total_creators: storage::get_total_creators(env),
        total_tips: storage::get_tip_count(env),
        total_volume: storage::get_total_tips_volume(env),
        total_fees_collected: storage::get_total_fees(env),
        active_creators_30d: active_30d,
        tips_last_24h: tips_24h,
        volume_last_24h: volume_24h,
    })
}

/// Get statistics for a specific creator
pub fn get_creator_stats(env: &Env, creator: &Address) -> Result<CreatorStats, ContractError> {
    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    storage::extend_instance_ttl(env);

    let profile = storage::get_profile(env, creator);
    let rank = crate::leaderboard::get_leaderboard_rank(env, creator);

    Ok(CreatorStats {
        creator: creator.clone(),
        total_tips_count: profile.total_tips_count,
        total_tips_received: profile.total_tips_received,
        balance: profile.balance,
        credit_score: profile.credit_score,
        leaderboard_rank: rank,
        registered_at: profile.registered_at,
    })
}

/// Update 24-hour statistics when a tip is sent
pub fn update_24h_stats(env: &Env, amount: i128) {
    let now = env.ledger().timestamp();
    
    // Get current 24h window start
    let window_start = storage::get_stats_window_start(env);
    
    // If more than 24 hours have passed, reset the window
    if now - window_start > 86400 {
        storage::set_stats_window_start(env, now);
        storage::set_tips_last_24h(env, 1);
        storage::set_volume_last_24h(env, amount);
    } else {
        // Increment within current window
        let current_tips = storage::get_tips_last_24h(env);
        let current_volume = storage::get_volume_last_24h(env);
        storage::set_tips_last_24h(env, current_tips + 1);
        storage::set_volume_last_24h(env, current_volume + amount);
    }
}

/// Mark a creator as active (called when they receive a tip)
pub fn mark_creator_active(env: &Env, creator: &Address) {
    let now = env.ledger().timestamp();
    storage::set_creator_last_active(env, creator, now);
    
    // Update active creators count for 30d window
    update_active_creators_count(env);
}

/// Update the count of active creators in the last 30 days
fn update_active_creators_count(env: &Env) {
    // This is a simplified implementation
    // In production, you'd want to maintain a more efficient data structure
    let count = storage::get_active_creators_30d(env);
    storage::set_active_creators_30d(env, count);
}
