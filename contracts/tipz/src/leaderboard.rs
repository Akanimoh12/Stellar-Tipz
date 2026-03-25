//! Leaderboard tracking for the Tipz contract.
//!
//! Maintains a sorted list (descending by `total_tips_received`) of up to
//! [`MAX_LEADERBOARD_SIZE`] creators.  The list is refreshed after every tip
//! via [`update_leaderboard`].
//!
//! ## Storage
//! The leaderboard uses a small internal state split across:
//! - ordered entries for list reads
//! - an address → total-tips map for O(1) membership checks
//! - an address → rank map for O(1) rank lookups
//!
//! ## Complexity
//! Updates are O(n) for n ≤ 50 using ordered insertion, avoiding the previous
//! O(n²) selection sort in the common write path.

use soroban_sdk::{contracttype, Address, Env, Map, Vec};

use crate::types::{LeaderboardEntry, Profile};

/// Maximum number of entries retained on the leaderboard.
pub const MAX_LEADERBOARD_SIZE: u32 = 50;

// ── internal helpers ──────────────────────────────────────────────────────────

#[contracttype]
enum LeaderboardDataKey {
    Entries,
    Totals,
    Ranks,
}

fn load_entries(env: &Env) -> Vec<LeaderboardEntry> {
    env.storage()
        .instance()
        .get(&LeaderboardDataKey::Entries)
        .unwrap_or_else(|| Vec::new(env))
}

fn load_totals(env: &Env) -> Map<Address, i128> {
    env.storage()
        .instance()
        .get(&LeaderboardDataKey::Totals)
        .unwrap_or_else(|| Map::new(env))
}

fn load_ranks(env: &Env) -> Map<Address, u32> {
    env.storage()
        .instance()
        .get(&LeaderboardDataKey::Ranks)
        .unwrap_or_else(|| Map::new(env))
}

fn save_entries(env: &Env, entries: &Vec<LeaderboardEntry>) {
    env.storage()
        .instance()
        .set(&LeaderboardDataKey::Entries, entries);
}

fn save_totals(env: &Env, totals: &Map<Address, i128>) {
    env.storage()
        .instance()
        .set(&LeaderboardDataKey::Totals, totals);
}

fn save_ranks(env: &Env, ranks: &Map<Address, u32>) {
    env.storage()
        .instance()
        .set(&LeaderboardDataKey::Ranks, ranks);
}

fn make_entry(profile: &Profile) -> LeaderboardEntry {
    LeaderboardEntry {
        address: profile.owner.clone(),
        username: profile.username.clone(),
        total_tips_received: profile.total_tips_received,
        credit_score: profile.credit_score,
    }
}

fn rebuild_lookup_maps(env: &Env, entries: &Vec<LeaderboardEntry>) {
    let mut totals = Map::new(env);
    let mut ranks = Map::new(env);

    let mut i: u32 = 0;
    while i < entries.len() {
        let entry = entries.get(i).unwrap();
        totals.set(entry.address.clone(), entry.total_tips_received);
        ranks.set(entry.address.clone(), i + 1);
        i += 1;
    }

    save_totals(env, &totals);
    save_ranks(env, &ranks);
}

fn insert_sorted(entries: &mut Vec<LeaderboardEntry>, entry: LeaderboardEntry) {
    let mut insert_at = entries.len();
    let mut i: u32 = 0;
    while i < entries.len() {
        if entry.total_tips_received > entries.get(i).unwrap().total_tips_received {
            insert_at = i;
            break;
        }
        i += 1;
    }

    entries.insert(insert_at, entry);
}

// ── public API ────────────────────────────────────────────────────────────────

/// Refresh the leaderboard after `profile` has received a tip.
///
/// If the creator already has an entry it is updated in-place; otherwise a new
/// entry is appended.  The list is then sorted descending by
/// `total_tips_received` and trimmed to [`MAX_LEADERBOARD_SIZE`].
pub fn update_leaderboard(env: &Env, profile: &Profile) {
    let mut entries = load_entries(env);
    if let Some(rank) = load_ranks(env).get(profile.owner.clone()) {
        entries.remove(rank - 1);
    }

    insert_sorted(&mut entries, make_entry(profile));

    while entries.len() > MAX_LEADERBOARD_SIZE {
        entries.pop_back();
    }

    save_entries(env, &entries);
    rebuild_lookup_maps(env, &entries);
}

/// Return up to `limit` leaderboard entries sorted descending by total tips.
///
/// Passing `limit = 0` returns the full list.
pub fn get_leaderboard(env: &Env, limit: u32) -> Vec<LeaderboardEntry> {
    let entries = load_entries(env);
    if limit == 0 || limit >= entries.len() {
        return entries;
    }
    let mut result = Vec::new(env);
    let mut i: u32 = 0;
    while i < limit {
        result.push_back(entries.get(i).unwrap());
        i += 1;
    }
    result
}

/// Return `true` if `address` is currently on the leaderboard.
pub fn is_on_leaderboard(env: &Env, address: &Address) -> bool {
    load_totals(env).contains_key(address.clone())
}

/// Return the 1-based rank of `address` on the leaderboard, or `None` when
/// the address is not present.
pub fn get_leaderboard_rank(env: &Env, address: &Address) -> Option<u32> {
    if !is_on_leaderboard(env, address) {
        return None;
    }

    load_ranks(env).get(address.clone())
}
