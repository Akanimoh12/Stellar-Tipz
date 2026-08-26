//! Leaderboard tracking for the Tipz contract.
//!
//! Maintains a sorted list (descending by `amount`) of up to
//! [`MAX_LEADERBOARD_SIZE`] creators. The list is refreshed after every tip
//! via [`update_leaderboard`].
//!
//! ## Storage
//! The leaderboard stores a single `Vec<LeaderboardEntry>` under
//! `DataKey::Leaderboard` in instance storage.
//!
//! ## Complexity
//! Updates use binary search for O(log n) insertion position finding.
//!
//! ## Tie-breaking
//! When two creators have equal `amount`, the one who reached that amount
//! **first** keeps the higher rank (earlier insertion in the list).
//!
//! The implementation uses a stable binary search that finds the insertion
//! index **after** existing entries with the same amount. This ensures that
//! if two creators have the same `amount`, the one inserted earlier maintains
//! a better position. This tie-breaking order is deterministic and independent
//! of insertion order into the leaderboard, making it safe for consensus across
//! multiple nodes.
//!
//! ### Example
//! If creators A, B, and C all have `amount = 100`, and they reached that
//! amount in order (A → B → C), the leaderboard will maintain the order
//! `[A, B, C, ...]` regardless of the order in which subsequent tips update
//! the leaderboard.

use soroban_sdk::{Address, Env, Vec};

use crate::storage;
use crate::types::{LeaderboardEntry, LeaderboardPeriod, Profile};

/// Maximum number of entries retained on the leaderboard.
pub const MAX_LEADERBOARD_SIZE: u32 = 50;

// ── internal helpers ──────────────────────────────────────────────────────────

fn load_entries(env: &Env, period: LeaderboardPeriod) -> Vec<LeaderboardEntry> {
    storage::get_leaderboard(env, period)
}

fn save_entries(env: &Env, period: LeaderboardPeriod, entries: &Vec<LeaderboardEntry>) {
    storage::set_leaderboard(env, period, entries);
}

/// Finds the first index where an entry with `amount` should be inserted
/// to maintain descending order. Stable: new entries are placed after existing
/// ones with the same amount.
fn find_insertion_index(entries: &Vec<LeaderboardEntry>, amount: i128) -> u32 {
    let mut low = 0;
    let mut high = entries.len();
    while low < high {
        let mid = low + (high - low) / 2;
        if entries.get(mid).unwrap().amount >= amount {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    low
}

/// Re-position `profile` within a single sorted leaderboard `entries` list
/// for a new cumulative `amount`.
///
/// The list is kept sorted descending and bounded to [`MAX_LEADERBOARD_SIZE`].
/// The update is a remove-then-insert so a creator never appears twice:
///
/// 1. **Remove** the creator's existing entry, if present (their amount only
///    ever grows, so the old position is always stale).
/// 2. **Find** the new insertion index via [`find_insertion_index`]
///    (O(log n) binary search, stable on ties).
/// 3. **Insert** only if the position is within the capped window; an amount
///    that ranks beyond [`MAX_LEADERBOARD_SIZE`] is dropped outright.
/// 4. **Evict** the now-lowest entry if the insert pushed the list over the
///    cap, keeping exactly the top `MAX_LEADERBOARD_SIZE`.
fn update_entries(entries: &mut Vec<LeaderboardEntry>, profile: &Profile, amount: i128) {
    // Step 1 — drop the creator's stale entry if they are already ranked.
    let mut i: u32 = 0;
    while i < entries.len() {
        if entries.get(i).unwrap().address == profile.owner {
            entries.remove(i);
            break;
        }
        i += 1;
    }

    // Step 2 — locate where the new amount belongs in descending order.
    let insert_pos = find_insertion_index(entries, amount);

    // Step 3 — only materialise the entry if it lands inside the top window.
    if insert_pos < MAX_LEADERBOARD_SIZE {
        let new_entry = LeaderboardEntry {
            address: profile.owner.clone(),
            username: profile.username.clone(),
            amount,
            credit_score: profile.credit_score,
        };
        entries.insert(insert_pos, new_entry);

        // Step 4 — trim the tail so the list never exceeds the cap.
        if entries.len() > MAX_LEADERBOARD_SIZE {
            entries.pop_back();
        }
    }
}

// ── public API ────────────────────────────────────────────────────────────────

/// Refresh all three leaderboards (all-time, monthly, weekly) after `profile`
/// has received a tip of `amount`.
///
/// Deactivated profiles are skipped so a banned creator cannot occupy a slot;
/// active profiles are forwarded to [`update_all_leaderboards_for_active`].
pub fn update_all_leaderboards(env: &Env, profile: &Profile, amount: i128) {
    if storage::is_profile_deactivated(env, &profile.owner) {
        return;
    }
    update_all_leaderboards_for_active(env, profile, amount);
}

/// Apply a tip to all three leaderboards in a single read-modify-write of the
/// combined [`storage::LeaderboardSet`], avoiding three separate storage round
/// trips. All-time ranks by lifetime `total_tips_received`; monthly and weekly
/// rank by the rolling per-period volume (which the storage layer rolls over
/// when a period boundary is crossed).
pub fn update_all_leaderboards_for_active(env: &Env, profile: &Profile, amount: i128) {
    let mut boards = storage::get_leaderboard_set(env).unwrap_or_else(|| storage::LeaderboardSet {
        all_time: storage::get_leaderboard(env, LeaderboardPeriod::AllTime),
        monthly: storage::get_leaderboard(env, LeaderboardPeriod::Monthly),
        weekly: storage::get_leaderboard(env, LeaderboardPeriod::Weekly),
        monthly_reset_at: storage::get_last_leaderboard_reset(env, LeaderboardPeriod::Monthly),
        weekly_reset_at: storage::get_last_leaderboard_reset(env, LeaderboardPeriod::Weekly),
    });
    let (monthly_total, weekly_total) = storage::add_creator_period_volumes(
        env,
        &profile.owner,
        boards.monthly_reset_at,
        boards.weekly_reset_at,
        amount,
    );

    update_entries(&mut boards.all_time, profile, profile.total_tips_received);
    update_entries(&mut boards.monthly, profile, monthly_total);
    update_entries(&mut boards.weekly, profile, weekly_total);

    storage::set_leaderboard_set(env, &boards);
}

/// Update all leaderboards after a refund (subtract the refunded amount).
///
/// This recalculates the creator's position on all leaderboards after their
/// total tips have been reduced by a refund.
pub fn update_all_leaderboards_for_refund(env: &Env, profile: &Profile, refunded_amount: i128) {
    if storage::is_profile_deactivated(env, &profile.owner) {
        return;
    }

    let mut boards = storage::get_leaderboard_set(env).unwrap_or_else(|| storage::LeaderboardSet {
        all_time: storage::get_leaderboard(env, LeaderboardPeriod::AllTime),
        monthly: storage::get_leaderboard(env, LeaderboardPeriod::Monthly),
        weekly: storage::get_leaderboard(env, LeaderboardPeriod::Weekly),
        monthly_reset_at: storage::get_last_leaderboard_reset(env, LeaderboardPeriod::Monthly),
        weekly_reset_at: storage::get_last_leaderboard_reset(env, LeaderboardPeriod::Weekly),
    });

    // Subtract from period volumes
    let (monthly_total, weekly_total) = storage::add_creator_period_volumes(
        env,
        &profile.owner,
        boards.monthly_reset_at,
        boards.weekly_reset_at,
        -refunded_amount, // Negative to subtract
    );

    // Update all leaderboards with new totals
    update_entries(&mut boards.all_time, profile, profile.total_tips_received);
    update_entries(&mut boards.monthly, profile, monthly_total);
    update_entries(&mut boards.weekly, profile, weekly_total);

    storage::set_leaderboard_set(env, &boards);
}

/// Remove `address` from every period leaderboard (e.g. on profile
/// deactivation), so a delisted creator leaves no residual ranking.
pub fn remove_from_all_leaderboards(env: &Env, address: &Address) {
    remove_from_leaderboard(env, LeaderboardPeriod::AllTime, address);
    remove_from_leaderboard(env, LeaderboardPeriod::Monthly, address);
    remove_from_leaderboard(env, LeaderboardPeriod::Weekly, address);
}

/// Refresh a single `period` leaderboard for `profile`. The all-time board
/// ranks by lifetime tips; period boards rank by the rolling per-period volume
/// returned from storage. No-op for deactivated profiles.
pub fn update_leaderboard(
    env: &Env,
    profile: &Profile,
    period: LeaderboardPeriod,
    tip_amount: i128,
) {
    if storage::is_profile_deactivated(env, &profile.owner) {
        return;
    }

    let period_total = if period == LeaderboardPeriod::AllTime {
        profile.total_tips_received
    } else {
        storage::add_creator_period_volume(env, &profile.owner, period, tip_amount)
    };

    let mut entries = load_entries(env, period);
    update_entries(&mut entries, profile, period_total);
    save_entries(env, period, &entries);
}

/// Clear a period leaderboard and stamp the reset time (used at month/week
/// rollover). The all-time board is immutable and never reset.
pub fn reset_leaderboard(env: &Env, period: LeaderboardPeriod) {
    if period == LeaderboardPeriod::AllTime {
        return; // All-time never resets
    }

    let timestamp = env.ledger().timestamp();
    save_entries(env, period, &Vec::new(env));
    storage::set_last_leaderboard_reset(env, period, timestamp);
}

/// Return up to `limit` leaderboard entries sorted descending by total tips.
pub fn get_leaderboard(env: &Env, period: LeaderboardPeriod, limit: u32) -> Vec<LeaderboardEntry> {
    let entries = load_entries(env, period);
    if limit == 0 || limit >= entries.len() {
        return entries;
    }
    let mut result = Vec::new(env);
    let mut i: u32 = 0;
    while i < limit && i < entries.len() {
        result.push_back(entries.get(i).unwrap().clone());
        i += 1;
    }
    result
}

#[allow(dead_code)]
pub fn is_on_leaderboard(env: &Env, period: LeaderboardPeriod, address: &Address) -> bool {
    let entries = load_entries(env, period);
    for e in entries.iter() {
        if e.address == *address {
            return true;
        }
    }
    false
}

#[allow(dead_code)]
pub fn get_leaderboard_rank(
    env: &Env,
    period: LeaderboardPeriod,
    address: &Address,
) -> Option<u32> {
    let entries = load_entries(env, period);
    let mut i: u32 = 0;
    for e in entries.iter() {
        if e.address == *address {
            return Some(i + 1);
        }
        i += 1;
    }
    None
}

#[allow(dead_code)]
pub fn remove_from_leaderboard(env: &Env, period: LeaderboardPeriod, address: &Address) {
    let entries = load_entries(env, period);
    let mut new_entries: Vec<LeaderboardEntry> = Vec::new(env);
    for e in entries.iter() {
        if e.address != *address {
            new_entries.push_back(e);
        }
    }
    save_entries(env, period, &new_entries);
}

pub fn get_leaderboard_size(env: &Env, period: LeaderboardPeriod) -> u32 {
    load_entries(env, period).len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TipzContract;
    use soroban_sdk::{testutils::Address as _, Address, Env, Map, String, Symbol};

    fn make_profile(
        env: &Env,
        address: Address,
        username: &str,
        total_tips_received: i128,
    ) -> Profile {
        let now = env.ledger().timestamp();
        Profile {
            owner: address.clone(),
            username: String::from_str(env, username),
            display_name: String::from_str(env, username),
            bio: String::from_str(env, ""),
            website: String::from_str(env, ""),
            image_url: String::from_str(env, ""),
            social_links: Map::<Symbol, String>::new(env),
            x_handle: String::from_str(env, ""),
            x_followers: 0,
            x_engagement_avg: 0,
            credit_score: 40,
            total_tips_received,
            total_tips_count: 0,
            balance: 0,
            registered_at: now,
            updated_at: now,
            verification: crate::types::VerificationStatus::default(),
            domain: String::from_str(env, ""),
            domain_verified: false,
            domain_verified_at: None,
            custom_min_tip: None,
        }
    }

    #[test]
    fn test_find_insertion_index() {
        let env = Env::default();
        let mut list = Vec::new(&env);

        // Empty
        assert_eq!(find_insertion_index(&list, 100), 0);

        list.push_back(LeaderboardEntry {
            address: Address::generate(&env),
            username: String::from_str(&env, "u1"),
            amount: 100,
            credit_score: 50,
        });

        // Higher
        assert_eq!(find_insertion_index(&list, 200), 0);
        // Lower
        assert_eq!(find_insertion_index(&list, 50), 1);
        // Equal (stable)
        assert_eq!(find_insertion_index(&list, 100), 1);
    }

    #[test]
    fn test_update_leaderboard_basic() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr = Address::generate(&env);
            let profile = make_profile(&env, addr.clone(), "user", 100);

            update_leaderboard(&env, &profile, LeaderboardPeriod::AllTime, 0);

            let entries = load_entries(&env, LeaderboardPeriod::AllTime);
            assert_eq!(entries.len(), 1);
            assert_eq!(entries.get(0).unwrap().amount, 100);

            // Update
            let profile2 = make_profile(&env, addr.clone(), "user", 200);
            update_leaderboard(&env, &profile2, LeaderboardPeriod::AllTime, 0);
            let entries2 = load_entries(&env, LeaderboardPeriod::AllTime);
            assert_eq!(entries2.len(), 1);
            assert_eq!(entries2.get(0).unwrap().amount, 200);
        });
    }

    #[test]
    fn test_leaderboard_full_eviction() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let mut entries = Vec::new(&env);
            for i in 0..50 {
                entries.push_back(LeaderboardEntry {
                    address: Address::generate(&env),
                    username: String::from_str(&env, "user"),
                    amount: (i as i128 + 1) * 10,
                    credit_score: 50,
                });
            }
            save_entries(&env, LeaderboardPeriod::AllTime, &entries);

            // New high score
            let addr_new = Address::generate(&env);
            let profile_new = make_profile(&env, addr_new.clone(), "new", 1000);
            update_leaderboard(&env, &profile_new, LeaderboardPeriod::AllTime, 0);

            let result = load_entries(&env, LeaderboardPeriod::AllTime);
            assert_eq!(result.len(), 50);
            assert_eq!(result.get(0).unwrap().address, addr_new);

            // Lowest (10) should be gone
            for e in result.iter() {
                assert!(e.amount > 10 || e.address == addr_new);
            }
        });
    }
}
