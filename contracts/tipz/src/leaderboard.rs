//! Leaderboard tracking for the Tipz contract.
//!
//! Maintains a sorted list (descending by `total_tips_received`) of up to
//! [`MAX_LEADERBOARD_SIZE`] creators. The list is refreshed after every tip
//! via [`update_leaderboard`].
//!
//! ## Storage
//! The leaderboard stores a single `Vec<LeaderboardEntry>` under
//! `DataKey::Leaderboard` in instance storage.
//!
//! ## Complexity
//! Updates are O(n) for n ≤ 50 using insertion sort.
//!
//! ## Tie-breaking
//! When two creators have equal `total_tips_received`, the one who reached
//! that amount first keeps the higher rank. This is achieved by using a
//! **stable** insertion sort that only moves an entry forward when its total
//! is *strictly greater* than the entry ahead of it.

use soroban_sdk::{Address, Env, Vec};

use crate::storage::DataKey;
use crate::types::{LeaderboardEntry, Profile};

/// Maximum number of entries retained on the leaderboard.
pub const MAX_LEADERBOARD_SIZE: u32 = 50;

// ── internal helpers ──────────────────────────────────────────────────────────

fn load_entries(env: &Env) -> Vec<LeaderboardEntry> {
    env.storage()
        .instance()
        .get(&DataKey::Leaderboard)
        .unwrap_or_else(|| Vec::new(env))
}

fn save_entries(env: &Env, entries: &Vec<LeaderboardEntry>) {
    env.storage().instance().set(&DataKey::Leaderboard, entries);
}

/// Stable insertion sort: sorts `list` in descending order by
/// `total_tips_received`.
///
/// Entries with equal totals are **not** reordered — the one that was inserted
/// earlier (i.e. reached that total first) retains its higher position.  This
/// implements the documented tie-breaking rule: equal totals → first-to-arrive
/// wins.
fn sort_leaderboard(list: &mut Vec<LeaderboardEntry>) {
    let mut i: u32 = 1;
    while i < list.len() {
        let key = list.get(i).unwrap().clone();
        let mut j = i - 1;
        // Only move `key` forward when the entry ahead has a *strictly lower*
        // total.  Equal totals are left in place (stable / first-in wins).
        while j < i {
            let current = list.get(j).unwrap();
            if current.total_tips_received >= key.total_tips_received {
                break;
            }
            // Shift current down one position.
            let next = list.get(j + 1).unwrap().clone();
            list.set(j, next);
            list.set(j + 1, current.clone());
            if j == 0 {
                break;
            }
            j -= 1;
        }
        i += 1;
    }
}

// ── public API ────────────────────────────────────────────────────────────────

/// Refresh the leaderboard after `profile` has received a tip.
///
/// Three cases:
/// - If the creator already has an entry, it is updated and the list re-sorted.
/// - If the creator is new and the list has fewer than 50 entries, a new entry
///   is added and the list re-sorted.
/// - If the list is at capacity (50) and the creator's total is strictly greater
///   than the lowest entry's total, the lowest entry is replaced and the list
///   re-sorted. Otherwise no change is made.
///
/// The list is always kept in descending order by `total_tips_received` and
/// trimmed to at most 50 entries.
pub fn update_leaderboard(env: &Env, profile: &Profile) {
    let mut entries = load_entries(env);

    // Ensure the list is sorted before any operations (maintains invariant)
    if !entries.is_empty() {
        sort_leaderboard(&mut entries);
    }

    // Find existing entry if present
    let mut existing_index: Option<u32> = None;
    let mut i: u32 = 0;
    let len_u32 = entries.len();
    while i < len_u32 {
        if entries.get(i).unwrap().address == profile.owner {
            existing_index = Some(i);
            break;
        }
        i += 1;
    }

    if let Some(idx) = existing_index {
        // Update existing entry in place
        entries.set(
            idx,
            LeaderboardEntry {
                address: profile.owner.clone(),
                username: profile.username.clone(),
                total_tips_received: profile.total_tips_received,
                credit_score: profile.credit_score,
            },
        );
    } else {
        // New creator: check capacity
        if entries.len() >= MAX_LEADERBOARD_SIZE {
            // List is full; after sorting, the last entry is the lowest
            let last_idx = entries.len() - 1;
            let last_entry = entries.get(last_idx).unwrap();
            if profile.total_tips_received <= last_entry.total_tips_received {
                // Not enough to enter the top 50; do nothing
                return;
            }
            // Replace the lowest entry
            entries.set(
                last_idx,
                LeaderboardEntry {
                    address: profile.owner.clone(),
                    username: profile.username.clone(),
                    total_tips_received: profile.total_tips_received,
                    credit_score: profile.credit_score,
                },
            );
        } else {
            // Room available: append
            entries.push_back(LeaderboardEntry {
                address: profile.owner.clone(),
                username: profile.username.clone(),
                total_tips_received: profile.total_tips_received,
                credit_score: profile.credit_score,
            });
        }
    }

    // Sort the list after modification
    sort_leaderboard(&mut entries);

    // Trim to max size (should already be ≤50, but ensure invariant)
    while entries.len() > MAX_LEADERBOARD_SIZE {
        entries.pop_back();
    }

    save_entries(env, &entries);
}

/// Return up to `limit` leaderboard entries sorted descending by total tips.
///
/// Passing `limit = 0` returns the full list. If `limit` exceeds the number of
/// stored entries, all entries are returned. The returned vector is in descending
/// order by `total_tips_received`.
pub fn get_leaderboard(env: &Env, limit: u32) -> Vec<LeaderboardEntry> {
    let entries = load_entries(env);
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
/// Return `true` if `address` is currently on the leaderboard.
pub fn is_on_leaderboard(env: &Env, address: &Address) -> bool {
    let entries = load_entries(env);
    let mut i: u32 = 0;
    let len_u32 = entries.len();
    while i < len_u32 {
        if entries.get(i).unwrap().address == *address {
            return true;
        }
        i += 1;
    }
    false
}

#[allow(dead_code)]
/// Return the 1-based rank of `address` on the leaderboard, or `None` when
/// the address is not present.
pub fn get_leaderboard_rank(env: &Env, address: &Address) -> Option<u32> {
    let entries = load_entries(env);
    let mut i: u32 = 0;
    let len_u32 = entries.len();
    while i < len_u32 {
        if entries.get(i).unwrap().address == *address {
            return Some(i + 1);
        }
        i += 1;
    }
    None
}

/// Remove `address` from the leaderboard (used during profile deregistration).
///
/// If the address is not present this is a no-op.  Entries above the removed
/// slot shift down by one position, preserving relative order.
///
/// Public API for the upcoming deregister flow; currently exercised only in tests.
#[allow(dead_code)]
pub fn remove_from_leaderboard(env: &Env, address: &Address) {
    let entries = load_entries(env);
    let mut new_entries: Vec<LeaderboardEntry> = Vec::new(env);
    let mut i: u32 = 0;
    while i < entries.len() {
        let entry = entries.get(i).unwrap();
        if entry.address != *address {
            new_entries.push_back(entry);
        }
        i += 1;
    }
    save_entries(env, &new_entries);
}

/// Return the current number of entries on the leaderboard.
pub fn get_leaderboard_size(env: &Env) -> u32 {
    load_entries(env).len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TipzContract;
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    // Helper to create a Profile with minimal required fields
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
            image_url: String::from_str(env, ""),
            x_handle: String::from_str(env, ""),
            x_followers: 0,
            x_engagement_avg: 0,
            credit_score: 40,
            total_tips_received,
            total_tips_count: 0,
            balance: 0,
            registered_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn test_sort_leaderboard_empty() {
        let env = Env::default();
        let mut list = Vec::new(&env);
        sort_leaderboard(&mut list);
        assert_eq!(list.len(), 0);
    }

    #[test]
    fn test_sort_leaderboard_single() {
        let env = Env::default();
        let mut list = Vec::new(&env);
        let addr = Address::generate(&env);
        list.push_back(LeaderboardEntry {
            address: addr.clone(),
            username: String::from_str(&env, "user"),
            total_tips_received: 100,
            credit_score: 50,
        });
        sort_leaderboard(&mut list);
        assert_eq!(list.get(0).unwrap().total_tips_received, 100);
    }

    #[test]
    fn test_sort_leaderboard_two_elements() {
        let env = Env::default();
        let mut list = Vec::new(&env);
        let addr1 = Address::generate(&env);
        let addr2 = Address::generate(&env);
        list.push_back(LeaderboardEntry {
            address: addr1.clone(),
            username: String::from_str(&env, "user1"),
            total_tips_received: 50,
            credit_score: 50,
        });
        list.push_back(LeaderboardEntry {
            address: addr2.clone(),
            username: String::from_str(&env, "user2"),
            total_tips_received: 100,
            credit_score: 50,
        });
        sort_leaderboard(&mut list);
        assert_eq!(list.get(0).unwrap().total_tips_received, 100);
        assert_eq!(list.get(1).unwrap().total_tips_received, 50);
    }

    #[test]
    fn test_sort_leaderboard_reverse_sorted() {
        let env = Env::default();
        let mut list = Vec::new(&env);
        let mut i: u32 = 0;
        while i < 5 {
            let addr = Address::generate(&env);
            list.push_back(LeaderboardEntry {
                address: addr,
                username: String::from_str(&env, "user"),
                total_tips_received: (5 - i) as i128 * 10,
                credit_score: 50,
            });
            i += 1;
        }
        sort_leaderboard(&mut list);
        let mut i: u32 = 0;
        while i < 5 - 1 {
            let curr = list.get(i).unwrap().total_tips_received;
            let next = list.get(i + 1).unwrap().total_tips_received;
            assert!(curr >= next);
            i += 1;
        }
    }

    #[test]
    fn test_sort_leaderboard_tie_breaking() {
        let env = Env::default();
        let mut list = Vec::new(&env);
        let addr_a = Address::generate(&env);
        let addr_b = Address::generate(&env);
        // Both have the same total; addr_a is inserted first.
        list.push_back(LeaderboardEntry {
            address: addr_a.clone(),
            username: String::from_str(&env, "a"),
            total_tips_received: 100,
            credit_score: 50,
        });
        list.push_back(LeaderboardEntry {
            address: addr_b.clone(),
            username: String::from_str(&env, "b"),
            total_tips_received: 100,
            credit_score: 50,
        });
        sort_leaderboard(&mut list);
        // addr_a was inserted first and must keep the higher position.
        assert_eq!(
            list.get(0).unwrap().address,
            addr_a,
            "first-to-arrive should keep higher rank on tie"
        );
        assert_eq!(list.get(1).unwrap().address, addr_b);
    }

    #[test]
    fn test_update_leaderboard_case_update_existing() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr = Address::generate(&env);
            let mut entries = Vec::new(&env);
            entries.push_back(LeaderboardEntry {
                address: addr.clone(),
                username: String::from_str(&env, "user"),
                total_tips_received: 100,
                credit_score: 50,
            });
            save_entries(&env, &entries);

            let profile2 = make_profile(&env, addr.clone(), "user2", 200);
            update_leaderboard(&env, &profile2);

            let new_entries = load_entries(&env);
            assert_eq!(new_entries.len(), 1);
            assert_eq!(new_entries.get(0).unwrap().total_tips_received, 200);
            assert_eq!(new_entries.get(0).unwrap().username, profile2.username);
        });
    }

    #[test]
    fn test_update_leaderboard_case_append() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr = Address::generate(&env);
            let entries = Vec::new(&env);
            save_entries(&env, &entries);

            let profile = make_profile(&env, addr.clone(), "user", 100);
            update_leaderboard(&env, &profile);

            let new_entries = load_entries(&env);
            assert_eq!(new_entries.len(), 1);
            assert_eq!(new_entries.get(0).unwrap().address, addr);
        });
    }

    #[test]
    fn test_update_leaderboard_case_replace_lowest() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr_new = Address::generate(&env);
            let mut entries = Vec::new(&env);
            // Fill with 50 entries with totals 1..50 (unsorted)
            let mut i: u32 = 0;
            while i < 50 {
                let addr = Address::generate(&env);
                entries.push_back(LeaderboardEntry {
                    address: addr,
                    username: String::from_str(&env, "user"),
                    total_tips_received: i as i128 + 1,
                    credit_score: 50,
                });
                i += 1;
            }
            save_entries(&env, &entries);

            let profile_new = make_profile(&env, addr_new.clone(), "newuser", 100);
            update_leaderboard(&env, &profile_new);

            let new_entries = load_entries(&env);
            assert_eq!(new_entries.len(), 50);
            // The new entry should be present
            let mut found = false;
            let mut j: u32 = 0;
            while j < new_entries.len() {
                if new_entries.get(j).unwrap().address == addr_new {
                    found = true;
                    break;
                }
                j += 1;
            }
            assert!(found, "new high-scoring creator should be on leaderboard");
            // The lowest (total=1) should be gone
            let mut has_lowest = false;
            let mut k: u32 = 0;
            while k < new_entries.len() {
                let e = new_entries.get(k).unwrap();
                if e.total_tips_received == 1 {
                    has_lowest = true;
                }
                k += 1;
            }
            assert!(!has_lowest, "lowest entry should be evicted");
        });
    }

    #[test]
    fn test_update_leaderboard_case_no_replace_if_not_greater() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr_new = Address::generate(&env);
            let mut entries = Vec::new(&env);
            // Fill with 50 entries with totals 1..50 (unsorted)
            let mut i: u32 = 0;
            while i < 50 {
                let addr = Address::generate(&env);
                entries.push_back(LeaderboardEntry {
                    address: addr,
                    username: String::from_str(&env, "user"),
                    total_tips_received: i as i128 + 1,
                    credit_score: 50,
                });
                i += 1;
            }
            save_entries(&env, &entries);

            let profile_equal = make_profile(&env, addr_new.clone(), "newuser", 1);
            update_leaderboard(&env, &profile_equal);

            let new_entries = load_entries(&env);
            assert_eq!(new_entries.len(), 50);
            let mut found = false;
            let mut j: u32 = 0;
            while j < new_entries.len() {
                if new_entries.get(j).unwrap().address == addr_new {
                    found = true;
                    break;
                }
                j += 1;
            }
            assert!(
                !found,
                "creator with total equal to lowest should not be added"
            );
        });
    }

    #[test]
    fn test_get_leaderboard_returns_correct_limit() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let mut entries = Vec::new(&env);
            let mut i: u32 = 0;
            while i < 10 {
                let addr = Address::generate(&env);
                entries.push_back(LeaderboardEntry {
                    address: addr,
                    username: String::from_str(&env, "user"),
                    total_tips_received: (10 - i) as i128 * 100,
                    credit_score: 50,
                });
                i += 1;
            }
            save_entries(&env, &entries);

            let result = get_leaderboard(&env, 5);
            assert_eq!(result.len(), 5);
            // Verify descending order
            let mut j: u32 = 0;
            while j < 4 {
                let curr = result.get(j).unwrap().total_tips_received;
                let next = result.get(j + 1).unwrap().total_tips_received;
                assert!(curr >= next);
                j += 1;
            }
        });
    }

    #[test]
    fn test_get_leaderboard_limit_zero_returns_all() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let mut entries = Vec::new(&env);
            let mut i: u32 = 0;
            while i < 5 {
                let addr = Address::generate(&env);
                entries.push_back(LeaderboardEntry {
                    address: addr,
                    username: String::from_str(&env, "user"),
                    total_tips_received: i as i128 * 10,
                    credit_score: 50,
                });
                i += 1;
            }
            save_entries(&env, &entries);

            let result = get_leaderboard(&env, 0);
            assert_eq!(result.len(), 5);
        });
    }

    #[test]
    fn test_get_leaderboard_empty_returns_empty() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let result = get_leaderboard(&env, 10);
            assert_eq!(result.len(), 0);
        });
    }

    #[test]
    fn test_is_on_leaderboard() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr = Address::generate(&env);
            let mut entries = Vec::new(&env);
            entries.push_back(LeaderboardEntry {
                address: addr.clone(),
                username: String::from_str(&env, "user"),
                total_tips_received: 100,
                credit_score: 50,
            });
            save_entries(&env, &entries);

            assert!(is_on_leaderboard(&env, &addr));
            let other = Address::generate(&env);
            assert!(!is_on_leaderboard(&env, &other));
        });
    }

    #[test]
    fn test_get_leaderboard_rank() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let mut entries = Vec::new(&env);
            let addr1 = Address::generate(&env);
            let addr2 = Address::generate(&env);
            entries.push_back(LeaderboardEntry {
                address: addr1.clone(),
                username: String::from_str(&env, "user1"),
                total_tips_received: 200,
                credit_score: 50,
            });
            entries.push_back(LeaderboardEntry {
                address: addr2.clone(),
                username: String::from_str(&env, "user2"),
                total_tips_received: 100,
                credit_score: 50,
            });
            save_entries(&env, &entries);

            assert_eq!(get_leaderboard_rank(&env, &addr1), Some(1));
            assert_eq!(get_leaderboard_rank(&env, &addr2), Some(2));
            let other = Address::generate(&env);
            assert_eq!(get_leaderboard_rank(&env, &other), None);
        });
    }

    /// Three entries all with equal totals must retain insertion order (stable sort).
    #[test]
    fn test_sort_leaderboard_all_equal_totals() {
        let env = Env::default();
        let addr_a = Address::generate(&env);
        let addr_b = Address::generate(&env);
        let addr_c = Address::generate(&env);
        let mut list = Vec::new(&env);
        list.push_back(LeaderboardEntry {
            address: addr_a.clone(),
            username: String::from_str(&env, "a"),
            total_tips_received: 100,
            credit_score: 50,
        });
        list.push_back(LeaderboardEntry {
            address: addr_b.clone(),
            username: String::from_str(&env, "b"),
            total_tips_received: 100,
            credit_score: 50,
        });
        list.push_back(LeaderboardEntry {
            address: addr_c.clone(),
            username: String::from_str(&env, "c"),
            total_tips_received: 100,
            credit_score: 50,
        });
        sort_leaderboard(&mut list);
        assert_eq!(list.len(), 3);
        // All totals equal — insertion order must be preserved.
        assert_eq!(list.get(0).unwrap().address, addr_a);
        assert_eq!(list.get(1).unwrap().address, addr_b);
        assert_eq!(list.get(2).unwrap().address, addr_c);
    }

    /// An entry with the highest total placed last must bubble all the way to
    /// index 0, exercising every decrement of j down to 0.
    #[test]
    fn test_sort_leaderboard_entry_bubbles_to_position_zero() {
        let env = Env::default();
        let mut list = Vec::new(&env);
        // Insert in ascending order so the last element is the largest.
        let addrs: soroban_sdk::Vec<Address> = {
            let mut v = soroban_sdk::Vec::new(&env);
            let mut k: u32 = 0;
            while k < 4 {
                v.push_back(Address::generate(&env));
                k += 1;
            }
            v
        };
        let totals: [i128; 4] = [10, 20, 30, 100];
        let mut k: u32 = 0;
        while k < 4 {
            list.push_back(LeaderboardEntry {
                address: addrs.get(k).unwrap(),
                username: String::from_str(&env, "u"),
                total_tips_received: totals[k as usize],
                credit_score: 50,
            });
            k += 1;
        }
        sort_leaderboard(&mut list);
        // Highest (100) must be at position 0.
        assert_eq!(list.get(0).unwrap().total_tips_received, 100);
        // Remaining entries must be in descending order.
        let mut idx: u32 = 0;
        while idx < list.len() - 1 {
            assert!(
                list.get(idx).unwrap().total_tips_received
                    >= list.get(idx + 1).unwrap().total_tips_received
            );
            idx += 1;
        }
    }

    /// update_leaderboard: two entries where the second has a higher total must
    /// end with the higher-total entry at rank 1.
    #[test]
    fn test_update_leaderboard_two_entries_need_swap() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr_low = Address::generate(&env);
            let addr_high = Address::generate(&env);

            // Insert lower total first, higher total second.
            update_leaderboard(&env, &make_profile(&env, addr_low.clone(), "low", 50));
            update_leaderboard(&env, &make_profile(&env, addr_high.clone(), "high", 200));

            let entries = load_entries(&env);
            assert_eq!(entries.len(), 2);
            assert_eq!(
                entries.get(0).unwrap().address,
                addr_high,
                "higher-total entry must be rank 1"
            );
            assert_eq!(entries.get(1).unwrap().address, addr_low);
        });
    }

    /// update_leaderboard: all entries with the same total preserve insertion order.
    #[test]
    fn test_update_leaderboard_all_equal_totals() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr_a = Address::generate(&env);
            let addr_b = Address::generate(&env);
            let addr_c = Address::generate(&env);

            update_leaderboard(&env, &make_profile(&env, addr_a.clone(), "a", 100));
            update_leaderboard(&env, &make_profile(&env, addr_b.clone(), "b", 100));
            update_leaderboard(&env, &make_profile(&env, addr_c.clone(), "c", 100));

            let entries = load_entries(&env);
            assert_eq!(entries.len(), 3);
            assert_eq!(entries.get(0).unwrap().address, addr_a, "first-in keeps rank 1");
            assert_eq!(entries.get(1).unwrap().address, addr_b);
            assert_eq!(entries.get(2).unwrap().address, addr_c);
        });
    }

    /// update_leaderboard: a new entry with the highest total must reach rank 1
    /// (position 0) even when the existing list has multiple entries.
    #[test]
    fn test_update_leaderboard_entry_sorts_to_position_zero() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr_top = Address::generate(&env);
            let addr_a = Address::generate(&env);
            let addr_b = Address::generate(&env);
            let addr_c = Address::generate(&env);

            // Build a list of three mid-range entries, then add the top scorer.
            update_leaderboard(&env, &make_profile(&env, addr_a.clone(), "a", 10));
            update_leaderboard(&env, &make_profile(&env, addr_b.clone(), "b", 20));
            update_leaderboard(&env, &make_profile(&env, addr_c.clone(), "c", 30));
            update_leaderboard(&env, &make_profile(&env, addr_top.clone(), "top", 999));

            let entries = load_entries(&env);
            assert_eq!(entries.len(), 4);
            assert_eq!(
                entries.get(0).unwrap().address,
                addr_top,
                "new highest-total entry must be at position 0"
            );
            // Remaining entries in descending order.
            let mut idx: u32 = 0;
            while idx < entries.len() - 1 {
                assert!(
                    entries.get(idx).unwrap().total_tips_received
                        >= entries.get(idx + 1).unwrap().total_tips_received
                );
                idx += 1;
            }
        });
    }

    /// Two creators with the same tip total must maintain their insertion order
    /// (first-to-arrive keeps the higher rank) after `update_leaderboard`.
    #[test]
    fn test_leaderboard_tiebreaking() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr_first = Address::generate(&env);
            let addr_second = Address::generate(&env);

            // addr_first reaches 100 first.
            let profile_first = make_profile(&env, addr_first.clone(), "first", 100);
            update_leaderboard(&env, &profile_first);

            // addr_second reaches the same total afterwards.
            let profile_second = make_profile(&env, addr_second.clone(), "second", 100);
            update_leaderboard(&env, &profile_second);

            let entries = load_entries(&env);
            assert_eq!(entries.len(), 2);
            assert_eq!(
                entries.get(0).unwrap().address,
                addr_first,
                "first-to-arrive must hold the higher rank on tie"
            );
            assert_eq!(entries.get(1).unwrap().address, addr_second);
        });
    }

    /// Removing an entry shifts the remaining entries up and reduces the size.
    #[test]
    fn test_leaderboard_remove() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TipzContract);
        env.as_contract(&contract_id, || {
            let addr1 = Address::generate(&env);
            let addr2 = Address::generate(&env);
            let addr3 = Address::generate(&env);

            update_leaderboard(&env, &make_profile(&env, addr1.clone(), "u1", 300));
            update_leaderboard(&env, &make_profile(&env, addr2.clone(), "u2", 200));
            update_leaderboard(&env, &make_profile(&env, addr3.clone(), "u3", 100));

            assert_eq!(get_leaderboard_size(&env), 3);

            // Remove the middle entry.
            remove_from_leaderboard(&env, &addr2);

            let entries = load_entries(&env);
            assert_eq!(entries.len(), 2, "size must decrease by one");
            assert_eq!(entries.get(0).unwrap().address, addr1, "rank 1 unchanged");
            assert_eq!(
                entries.get(1).unwrap().address,
                addr3,
                "addr3 shifts up to rank 2"
            );
            assert!(
                !is_on_leaderboard(&env, &addr2),
                "removed entry must be gone"
            );
        });
    }
}
