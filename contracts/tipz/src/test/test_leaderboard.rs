//! Tests for leaderboard functionality (issues #28, #397).
//!
//! ## Coverage
//! - [`test_leaderboard_initial_empty`]       — no tips → empty board
//! - [`test_leaderboard_single_creator`]      — one tipped creator appears
//! - [`test_leaderboard_ordering`]            — multiple creators sorted descending
//! - [`test_leaderboard_max_size`]            — 51 creators → only top 50 retained
//! - [`test_leaderboard_rank_update`]         — creator moves up after more tips
//! - [`test_leaderboard_rank_lookup`]         — `get_leaderboard_rank` returns correct 1-based position
//! - [`test_insert_at_position_zero`]         — new highest earner lands at index 0 (#397)
//! - [`test_insert_when_board_has_one_entry`] — correct ordering when second creator is added (#397)
//! - [`test_no_duplicates_after_update`]      — repeated tips to same creator yield one entry (#397)
//!
//! Tests that require XLM transfers use the full SAC setup (same pattern as
//! `test_tips.rs`).  The `test_leaderboard_max_size` test bypasses `send_tip`
//! and calls `leaderboard::update_leaderboard` directly inside the contract
//! context to avoid the overhead of 51 token transfers.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, Map, String, Symbol};

use crate::leaderboard::MAX_LEADERBOARD_SIZE;
use crate::storage::DataKey;
use crate::types::{Profile, VerificationStatus, VerificationType};
use crate::TipzContract;
use crate::TipzContractClient;

// ── shared usernames for the max-size test (3-32 chars, [a-z0-9_]) ───────────

const CREATOR_NAMES: [&str; 51] = [
    "n001", "n002", "n003", "n004", "n005", "n006", "n007", "n008", "n009", "n010", "n011", "n012",
    "n013", "n014", "n015", "n016", "n017", "n018", "n019", "n020", "n021", "n022", "n023", "n024",
    "n025", "n026", "n027", "n028", "n029", "n030", "n031", "n032", "n033", "n034", "n035", "n036",
    "n037", "n038", "n039", "n040", "n041", "n042", "n043", "n044", "n045", "n046", "n047", "n048",
    "n049", "n050", "n051",
];

// ── helpers ───────────────────────────────────────────────────────────────────

/// Full environment with an initialised contract, a funded tipper, and an SAC.
fn setup() -> (
    Env,
    TipzContractClient<'static>,
    Address, // contract_id
    Address, // tipper
    Address, // token_address
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    // Zero fee so the full tip amount is credited (simpler assertions).
    client.initialize(&admin, &fee_collector, &0, &token_address);

    let tipper = Address::generate(&env);
    token_admin_client.mint(&tipper, &1_000_000_000_000_i128); // 100 000 XLM

    (env, client, contract_id, tipper, token_address)
}

/// Insert a profile directly into persistent storage (bypasses validation so
/// tests stay fast and focused on leaderboard behaviour).
fn insert_profile(env: &Env, contract_id: &Address, address: &Address, username: &str) {
    let now = env.ledger().timestamp();
    let profile = Profile {
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
        total_tips_received: 0,
        total_tips_count: 0,
        balance: 0,
        registered_at: now,
        updated_at: now,
        verification: VerificationStatus {
            is_verified: false,
            verification_type: VerificationType::Unverified,
            verified_at: None,
            revoked_at: None,
        },
    };
    env.as_contract(contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Profile(address.clone()), &profile);
    });
}

// ── tests ─────────────────────────────────────────────────────────────────────

/// Before any tips are sent the leaderboard must be empty.
#[test]
fn test_leaderboard_initial_empty() {
    let (env, client, contract_id, _, _) = setup();
    let board = client.get_leaderboard(&50);
    assert_eq!(
        board.len(),
        0,
        "leaderboard should be empty before any tips"
    );

    let stranger = Address::generate(&env);
    env.as_contract(&contract_id, || {
        assert!(!crate::leaderboard::is_on_leaderboard(&env, &stranger));
    });
}

/// A single creator who has received a tip must appear on the leaderboard with
/// the correct total.
#[test]
fn test_leaderboard_single_creator() {
    let (env, client, contract_id, tipper, _) = setup();

    let creator = Address::generate(&env);
    insert_profile(&env, &contract_id, &creator, "alice");

    let amount: i128 = 10_000_000; // 1 XLM
    client.send_tip(&tipper, &creator, &amount, &String::from_str(&env, ""), &false);

    let board = client.get_leaderboard(&50);
    assert_eq!(board.len(), 1);
    assert_eq!(board.get(0).unwrap().address, creator);
    assert_eq!(board.get(0).unwrap().total_tips_received, amount);
    assert_eq!(
        board.get(0).unwrap().username,
        String::from_str(&env, "alice")
    );
    env.as_contract(&contract_id, || {
        assert!(crate::leaderboard::is_on_leaderboard(&env, &creator));
    });
}

/// With three creators the leaderboard must be ordered descending by
/// `total_tips_received`.
#[test]
fn test_leaderboard_ordering() {
    let (env, client, contract_id, tipper, _) = setup();

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);
    insert_profile(&env, &contract_id, &alice, "alice");
    insert_profile(&env, &contract_id, &bob, "bob");
    insert_profile(&env, &contract_id, &carol, "carol");

    let msg = String::from_str(&env, "");
    // alice: 3 XLM, carol: 5 XLM, bob: 1 XLM  →  expected order: carol, alice, bob
    client.send_tip(&tipper, &alice, &30_000_000, &msg, &false);
    client.send_tip(&tipper, &carol, &50_000_000, &msg, &false);
    client.send_tip(&tipper, &bob, &10_000_000, &msg, &false);

    let board = client.get_leaderboard(&50);
    assert_eq!(board.len(), 3);
    assert_eq!(
        board.get(0).unwrap().address,
        carol,
        "carol should be rank 1"
    );
    assert_eq!(
        board.get(1).unwrap().address,
        alice,
        "alice should be rank 2"
    );
    assert_eq!(board.get(2).unwrap().address, bob, "bob should be rank 3");

    // Verify the descending order invariant holds across the full list.
    assert!(board.get(0).unwrap().total_tips_received >= board.get(1).unwrap().total_tips_received);
    assert!(board.get(1).unwrap().total_tips_received >= board.get(2).unwrap().total_tips_received);
}

/// When 51 creators have received tips only the top 50 must be retained; the
/// lowest-earning creator must be pruned.
///
/// This test calls `leaderboard::update_leaderboard` directly inside the
/// contract context to avoid the cost of 51 token-transfer transactions.
#[test]
fn test_leaderboard_max_size() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);
    let now = env.ledger().timestamp();

    // Generate 51 addresses outside the contract context so they can be
    // referenced both inside the closure and in the assertions below.
    let mut addresses: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(&env);
    let mut i: u32 = 0;
    while i < 51 {
        addresses.push_back(Address::generate(&env));
        i += 1;
    }

    // Populate the leaderboard directly via the internal function.
    // Creator 0 receives the most tips (51 × 10 M stroops); creator 50
    // receives the least (1 × 10 M stroops) and should be pruned.
    env.as_contract(&contract_id, || {
        let mut i: u32 = 0;
        while i < 51 {
            let addr = addresses.get(i).unwrap();
            let tips = (51 - i) as i128 * 10_000_000;
            let profile = Profile {
                owner: addr.clone(),
                username: String::from_str(&env, CREATOR_NAMES[i as usize]),
                display_name: String::from_str(&env, CREATOR_NAMES[i as usize]),
                bio: String::from_str(&env, ""),
                website: String::from_str(&env, ""),
                image_url: String::from_str(&env, ""),
                social_links: Map::<Symbol, String>::new(&env),
                x_handle: String::from_str(&env, ""),
                x_followers: 0,
                x_engagement_avg: 0,
                credit_score: 40,
                total_tips_received: tips,
                total_tips_count: 1,
                balance: tips,
                registered_at: now,
                updated_at: now,
                verification: VerificationStatus {
                    is_verified: false,
                    verification_type: VerificationType::Unverified,
                    verified_at: None,
                    revoked_at: None,
                },
            };
            crate::leaderboard::update_leaderboard(&env, &profile);
            i += 1;
        }
    });

    let board = client.get_leaderboard(&50);
    assert_eq!(
        board.len(),
        MAX_LEADERBOARD_SIZE,
        "leaderboard must retain at most {MAX_LEADERBOARD_SIZE} entries"
    );

    // The creator at index 50 (1 × 10 M stroops) must have been pruned.
    let lowest = addresses.get(50).unwrap();
    let mut found = false;
    let mut j: u32 = 0;
    while j < board.len() {
        if board.get(j).unwrap().address == lowest {
            found = true;
            break;
        }
        j += 1;
    }
    assert!(
        !found,
        "lowest-tipped creator must be pruned from the top-50"
    );

    env.as_contract(&contract_id, || {
        assert!(!crate::leaderboard::is_on_leaderboard(&env, &lowest));
        assert!(crate::leaderboard::is_on_leaderboard(
            &env,
            &addresses.get(0).unwrap()
        ));
    });
}

/// A creator who overtakes another must appear at a higher rank after the
/// additional tip.
#[test]
fn test_leaderboard_rank_update() {
    let (env, client, contract_id, tipper, _) = setup();

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    insert_profile(&env, &contract_id, &alice, "alice");
    insert_profile(&env, &contract_id, &bob, "bob");

    let msg = String::from_str(&env, "");

    // Bob starts in the lead.
    client.send_tip(&tipper, &bob, &50_000_000, &msg, &false);
    client.send_tip(&tipper, &alice, &10_000_000, &msg, &false);

    let board_before = client.get_leaderboard(&50);
    assert_eq!(
        board_before.get(0).unwrap().address,
        bob,
        "bob should lead initially"
    );

    // Alice receives a larger tip and overtakes bob.
    client.send_tip(&tipper, &alice, &100_000_000, &msg, &false);

    let board_after = client.get_leaderboard(&50);
    assert_eq!(
        board_after.get(0).unwrap().address,
        alice,
        "alice should lead after receiving more tips"
    );
    assert_eq!(
        board_after.get(1).unwrap().address,
        bob,
        "bob should drop to rank 2"
    );
}

/// `get_leaderboard_rank` must return the correct 1-based position for every
/// ranked creator and `None` for an address not on the leaderboard.
#[test]
fn test_leaderboard_rank_lookup() {
    let (env, client, contract_id, tipper, _) = setup();

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);
    insert_profile(&env, &contract_id, &alice, "alice");
    insert_profile(&env, &contract_id, &bob, "bob");
    insert_profile(&env, &contract_id, &carol, "carol");

    let msg = String::from_str(&env, "");
    // carol: 5 XLM → rank 1, alice: 3 XLM → rank 2, bob: 1 XLM → rank 3
    client.send_tip(&tipper, &carol, &50_000_000, &msg, &false);
    client.send_tip(&tipper, &alice, &30_000_000, &msg, &false);
    client.send_tip(&tipper, &bob, &10_000_000, &msg, &false);

    assert_eq!(client.get_leaderboard_rank(&carol), Some(1));
    assert_eq!(client.get_leaderboard_rank(&alice), Some(2));
    assert_eq!(client.get_leaderboard_rank(&bob), Some(3));

    // An address that has never received a tip must not be ranked.
    let stranger = Address::generate(&env);
    assert_eq!(
        client.get_leaderboard_rank(&stranger),
        None,
        "unranked address should return None"
    );
}

// ── edge-case tests for issue #397 ───────────────────────────────────────────

/// A creator who receives a larger tip than all existing entries must land at
/// position 0 (rank 1) on the leaderboard.  This exercises the insertion-sort
/// path where the new key must bubble all the way to index 0.
#[test]
fn test_insert_at_position_zero() {
    let (env, client, contract_id, tipper, _) = setup();

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    insert_profile(&env, &contract_id, &alice, "alice");
    insert_profile(&env, &contract_id, &bob, "bob");

    let msg = String::from_str(&env, "");
    client.send_tip(&tipper, &alice, &20_000_000, &msg, &false); // 2 XLM
    client.send_tip(&tipper, &bob, &10_000_000, &msg, &false); // 1 XLM

    // carol arrives with the highest tip — must claim rank 1 (index 0).
    let carol = Address::generate(&env);
    insert_profile(&env, &contract_id, &carol, "carol");
    client.send_tip(&tipper, &carol, &50_000_000, &msg, &false); // 5 XLM

    let board = client.get_leaderboard(&50);
    assert_eq!(board.len(), 3);
    assert_eq!(
        board.get(0).unwrap().address,
        carol,
        "carol must be at position 0 after receiving the highest tip"
    );
    assert_eq!(
        client.get_leaderboard_rank(&carol),
        Some(1),
        "carol must be rank 1"
    );
    // Invariant: board is in descending order.
    assert!(board.get(0).unwrap().total_tips_received >= board.get(1).unwrap().total_tips_received);
    assert!(board.get(1).unwrap().total_tips_received >= board.get(2).unwrap().total_tips_received);
}

/// When the leaderboard has exactly one entry and a second creator is added,
/// both entries must be present and correctly ordered.  This guards the
/// boundary where the inner j-loop runs for a list of length two.
#[test]
fn test_insert_when_board_has_one_entry() {
    let (env, client, contract_id, tipper, _) = setup();

    let alice = Address::generate(&env);
    insert_profile(&env, &contract_id, &alice, "alice");
    client.send_tip(&tipper, &alice, &30_000_000, &String::from_str(&env, ""), &false); // 3 XLM

    let board_one = client.get_leaderboard(&50);
    assert_eq!(board_one.len(), 1, "should have exactly one entry");
    assert_eq!(board_one.get(0).unwrap().address, alice);

    // bob joins with a smaller tip — alice should stay at rank 1.
    let bob = Address::generate(&env);
    insert_profile(&env, &contract_id, &bob, "bob");
    client.send_tip(&tipper, &bob, &10_000_000, &String::from_str(&env, ""), &false); // 1 XLM

    let board_two = client.get_leaderboard(&50);
    assert_eq!(board_two.len(), 2, "should now have two entries");
    assert_eq!(
        board_two.get(0).unwrap().address,
        alice,
        "alice should remain rank 1"
    );
    assert_eq!(
        board_two.get(1).unwrap().address,
        bob,
        "bob should be rank 2"
    );
}

/// Tipping the same creator multiple times must result in exactly one
/// leaderboard entry whose `total_tips_received` reflects the cumulative
/// amount.  No duplicate entries must appear at any position.
#[test]
fn test_no_duplicates_after_update() {
    let (env, client, contract_id, tipper, _) = setup();

    let alice = Address::generate(&env);
    insert_profile(&env, &contract_id, &alice, "alice");

    let msg = String::from_str(&env, "");
    client.send_tip(&tipper, &alice, &10_000_000, &msg, &false); // tip 1 — 1 XLM
    client.send_tip(&tipper, &alice, &20_000_000, &msg, &false); // tip 2 — 2 XLM
    client.send_tip(&tipper, &alice, &30_000_000, &msg, &false); // tip 3 — 3 XLM

    let board = client.get_leaderboard(&50);
    assert_eq!(
        board.len(),
        1,
        "there must be exactly one leaderboard entry for alice"
    );
    assert_eq!(board.get(0).unwrap().address, alice);
    // Cumulative total: 10 + 20 + 30 = 60 XLM in stroops.
    assert_eq!(
        board.get(0).unwrap().total_tips_received,
        60_000_000,
        "total must reflect all three tips"
    );
}
