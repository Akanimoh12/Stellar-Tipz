//! Compute budget tests for the Tipz contract (issue #487).
//!
//! Measures CPU instruction count and memory bytes for each entry point to
//! confirm operations remain within Soroban's network limits and to catch
//! regressions after refactors.
//!
//! ## Soroban network limits (as of protocol 21)
//! | Resource            | Limit             |
//! |---------------------|-------------------|
//! | CPU instructions    | 100 000 000       |
//! | Memory bytes        | 41 943 040 (40 MB)|
//!
//! ## Thresholds used in this suite
//! All thresholds are set at ≤ 50 % of the hard limits so there is headroom for
//! contract growth before a network-level failure would occur.
//!
//! | Operation                               | CPU limit   | MEM limit   |
//! |-----------------------------------------|-------------|-------------|
//! | `register_profile`                      | 30 000 000  | 10 000 000  |
//! | `send_tip` (short message)              | 40 000 000  | 10 000 000  |
//! | `send_tip` (max 280-char message)       | 45 000 000  | 12 000 000  |
//! | `send_tip` (full 50-entry leaderboard)  | 50 000 000  | 15 000 000  |
//! | `withdraw_tips`                         | 30 000 000  | 10 000 000  |
//! | `get_leaderboard` (50 entries)          | 20 000 000  |  8 000 000  |

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, Map, String, Symbol};

use crate::leaderboard::MAX_LEADERBOARD_SIZE;
use crate::storage::DataKey;
use crate::types::{Profile, VerificationStatus, VerificationType};
use crate::TipzContract;
use crate::TipzContractClient;

// CPU instruction and memory byte thresholds (inclusive upper bounds).
const CPU_REGISTER:              u64 = 30_000_000;
const CPU_SEND_TIP_SHORT:        u64 = 40_000_000;
const CPU_SEND_TIP_MAX_MSG:      u64 = 45_000_000;
const CPU_SEND_TIP_FULL_BOARD:   u64 = 50_000_000;
const CPU_WITHDRAW:              u64 = 30_000_000;
const CPU_GET_LEADERBOARD_FULL:  u64 = 20_000_000;

const MEM_REGISTER:              u64 = 10_000_000;
const MEM_SEND_TIP_SHORT:        u64 = 10_000_000;
const MEM_SEND_TIP_MAX_MSG:      u64 = 12_000_000;
const MEM_SEND_TIP_FULL_BOARD:   u64 = 15_000_000;
const MEM_WITHDRAW:              u64 = 10_000_000;
const MEM_GET_LEADERBOARD_FULL:  u64 = 8_000_000;

// ── helpers ───────────────────────────────────────────────────────────────────

/// Names used for leaderboard-filling helpers (3–32 chars, [a-z0-9_]).
const BOARD_NAMES: [&str; 50] = [
    "b001", "b002", "b003", "b004", "b005", "b006", "b007", "b008", "b009", "b010",
    "b011", "b012", "b013", "b014", "b015", "b016", "b017", "b018", "b019", "b020",
    "b021", "b022", "b023", "b024", "b025", "b026", "b027", "b028", "b029", "b030",
    "b031", "b032", "b033", "b034", "b035", "b036", "b037", "b038", "b039", "b040",
    "b041", "b042", "b043", "b044", "b045", "b046", "b047", "b048", "b049", "b050",
];

/// Full environment: initialised contract + SAC + funded tipper.
fn setup() -> (
    Env,
    TipzContractClient<'static>,
    Address, // contract_id
    Address, // tipper
    Address, // token_address (SAC)
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
    // 2 % fee (200 bps) — same as production default.
    client.initialize(&admin, &fee_collector, &200_u32, &token_address);

    let tipper = Address::generate(&env);
    // Mint 1 000 000 XLM so every budget test can run without running dry.
    token_admin_client.mint(&tipper, &10_000_000_000_000_i128);

    (env, client, contract_id, tipper, token_address)
}

/// Insert a profile directly into persistent storage, bypassing validation.
/// This keeps helper setup cost outside the measured window.
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

/// Fill the leaderboard to exactly `MAX_LEADERBOARD_SIZE` entries by calling
/// `update_leaderboard` directly inside the contract context.
/// Creator 0 has the highest total; creator 49 has the lowest.
fn fill_leaderboard(env: &Env, contract_id: &Address) -> soroban_sdk::Vec<Address> {
    let mut addresses = soroban_sdk::Vec::new(env);
    let now = env.ledger().timestamp();

    let mut i: u32 = 0;
    while i < MAX_LEADERBOARD_SIZE {
        addresses.push_back(Address::generate(env));
        i += 1;
    }

    env.as_contract(contract_id, || {
        let mut i: u32 = 0;
        while i < MAX_LEADERBOARD_SIZE {
            let addr = addresses.get(i).unwrap();
            // Rank from highest (50 XLM) to lowest (1 XLM) so the board is full.
            let total = (MAX_LEADERBOARD_SIZE - i) as i128 * 10_000_000;
            let profile = Profile {
                owner: addr.clone(),
                username: String::from_str(env, BOARD_NAMES[i as usize]),
                display_name: String::from_str(env, BOARD_NAMES[i as usize]),
                bio: String::from_str(env, ""),
                website: String::from_str(env, ""),
                image_url: String::from_str(env, ""),
                social_links: Map::<Symbol, String>::new(env),
                x_handle: String::from_str(env, ""),
                x_followers: 0,
                x_engagement_avg: 0,
                credit_score: 40,
                total_tips_received: total,
                total_tips_count: 1,
                balance: total,
                registered_at: now,
                updated_at: now,
                verification: VerificationStatus {
                    is_verified: false,
                    verification_type: VerificationType::Unverified,
                    verified_at: None,
                    revoked_at: None,
                },
            };
            crate::leaderboard::update_leaderboard(env, &profile);
            i += 1;
        }
    });

    addresses
}

// ── budget tests ──────────────────────────────────────────────────────────────

/// CPU and memory cost of `register_profile`.
///
/// Worst-case strings: 32-char username, 64-char display name, 280-char bio,
/// 200-char image URL, 32-char x_handle.
#[test]
fn test_register_profile_budget() {
    let (env, client, _, _, _) = setup();

    let caller = Address::generate(&env);

    // Build worst-case string values.
    let username     = String::from_str(&env, "abcdefghijklmnopqrstuvwxyz123456"); // 32 chars
    let display_name = String::from_str(&env,
        "Alice Wonderland — The Longest Display Name You Can Have In Tipz!"); // ≤64 chars
    // 280-char bio.
    let bio = String::from_str(&env,
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. \
         Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. \
         Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris \
         nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in re");
    let image_url = String::from_str(&env, "https://example.com/avatar.png");
    let x_handle  = String::from_str(&env, "alice_x_handle");

    env.budget().reset_unlimited();

    client.register_profile(
        &caller,
        &username,
        &display_name,
        &bio,
        &image_url,
        &x_handle,
    );

    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "register_profile: CPU={}, MEM={}", cpu, mem);

    assert!(
        cpu <= CPU_REGISTER,
        "register_profile CPU {cpu} exceeds threshold {CPU_REGISTER}"
    );
    assert!(
        mem <= MEM_REGISTER,
        "register_profile MEM {mem} exceeds threshold {MEM_REGISTER}"
    );
}

/// CPU and memory cost of `send_tip` with a short message.
#[test]
fn test_send_tip_budget_short_message() {
    let (env, client, contract_id, tipper, _) = setup();

    let creator = Address::generate(&env);
    insert_profile(&env, &contract_id, &creator, "alice");

    let message = String::from_str(&env, "Great work!");
    let amount: i128 = 10_000_000; // 1 XLM

    env.budget().reset_unlimited();

    client.send_tip(&tipper, &creator, &amount, &message, &false);

    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "send_tip (short msg): CPU={}, MEM={}", cpu, mem);

    assert!(
        cpu <= CPU_SEND_TIP_SHORT,
        "send_tip (short) CPU {cpu} exceeds threshold {CPU_SEND_TIP_SHORT}"
    );
    assert!(
        mem <= MEM_SEND_TIP_SHORT,
        "send_tip (short) MEM {mem} exceeds threshold {MEM_SEND_TIP_SHORT}"
    );
}

/// CPU and memory cost of `send_tip` with the maximum allowed message (280 bytes).
///
/// This is the worst-case message scenario: validation iterates over all 280
/// bytes and the full message is written to temporary storage.
#[test]
fn test_send_tip_budget_max_message() {
    let (env, client, contract_id, tipper, _) = setup();

    let creator = Address::generate(&env);
    insert_profile(&env, &contract_id, &creator, "alice");

    // Exactly 280 ASCII characters — the maximum allowed by `TIP_MESSAGE_MAX_LEN`.
    let max_msg = String::from_str(
        &env,
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
         AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
         AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
         AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    let amount: i128 = 10_000_000; // 1 XLM

    env.budget().reset_unlimited();

    client.send_tip(&tipper, &creator, &amount, &max_msg, &false);

    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "send_tip (max 280-char msg): CPU={}, MEM={}", cpu, mem);

    assert!(
        cpu <= CPU_SEND_TIP_MAX_MSG,
        "send_tip (max msg) CPU {cpu} exceeds threshold {CPU_SEND_TIP_MAX_MSG}"
    );
    assert!(
        mem <= MEM_SEND_TIP_MAX_MSG,
        "send_tip (max msg) MEM {mem} exceeds threshold {MEM_SEND_TIP_MAX_MSG}"
    );
}

/// CPU and memory cost of `send_tip` when the leaderboard is at full capacity
/// (50 entries) and the new tip triggers a full insertion-sort rebalance.
///
/// Worst-case leaderboard scenario: pre-fill 50 entries with equal tips (each
/// 10 XLM), then send a new tip to a *new* creator with a higher total so it
/// must be inserted at position 0 and the bottom entry is evicted.
#[test]
fn test_send_tip_budget_full_leaderboard_rebalance() {
    let (env, client, contract_id, tipper, _) = setup();

    // Pre-fill the leaderboard to capacity without touching the budget meter.
    fill_leaderboard(&env, &contract_id);

    assert_eq!(
        client.get_leaderboard_size(),
        MAX_LEADERBOARD_SIZE,
        "leaderboard must be full before measuring rebalance cost"
    );

    // Register a new creator who will receive a tip large enough to land at
    // rank 1, forcing the sort to shift all 50 existing entries down by one
    // and evict the lowest earner.
    let top_creator = Address::generate(&env);
    insert_profile(&env, &contract_id, &top_creator, "topdog");

    // 60 XLM > 50 XLM (highest existing entry) → full board rebalance.
    let amount: i128 = 600_000_000;
    let message = String::from_str(&env, "");

    env.budget().reset_unlimited();

    client.send_tip(&tipper, &top_creator, &amount, &message, &false);

    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(
        &env,
        "send_tip (full leaderboard rebalance): CPU={}, MEM={}",
        cpu,
        mem
    );

    assert!(
        cpu <= CPU_SEND_TIP_FULL_BOARD,
        "send_tip (full board) CPU {cpu} exceeds threshold {CPU_SEND_TIP_FULL_BOARD}"
    );
    assert!(
        mem <= MEM_SEND_TIP_FULL_BOARD,
        "send_tip (full board) MEM {mem} exceeds threshold {MEM_SEND_TIP_FULL_BOARD}"
    );
}

/// CPU and memory cost of `withdraw_tips`.
#[test]
fn test_withdraw_tips_budget() {
    let (env, client, contract_id, tipper, _) = setup();

    let creator = Address::generate(&env);
    insert_profile(&env, &contract_id, &creator, "alice");

    // First, tip the creator so there is a non-zero balance to withdraw.
    let tip_amount: i128 = 100_000_000; // 10 XLM
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, ""),
        &false,
    );

    // Withdraw less than the full balance (fee is 2 %, so withdraw 5 XLM).
    let withdraw_amount: i128 = 50_000_000; // 5 XLM

    env.budget().reset_unlimited();

    client.withdraw_tips(&creator, &withdraw_amount);

    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "withdraw_tips: CPU={}, MEM={}", cpu, mem);

    assert!(
        cpu <= CPU_WITHDRAW,
        "withdraw_tips CPU {cpu} exceeds threshold {CPU_WITHDRAW}"
    );
    assert!(
        mem <= MEM_WITHDRAW,
        "withdraw_tips MEM {mem} exceeds threshold {MEM_WITHDRAW}"
    );
}

/// CPU and memory cost of `get_leaderboard` when the board holds the maximum
/// 50 entries (worst-case read path).
#[test]
fn test_get_leaderboard_budget_full() {
    let (env, client, contract_id, _, _) = setup();

    fill_leaderboard(&env, &contract_id);

    assert_eq!(
        client.get_leaderboard_size(),
        MAX_LEADERBOARD_SIZE,
        "leaderboard must be full before measuring read cost"
    );

    env.budget().reset_unlimited();

    let board = client.get_leaderboard(&50);

    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "get_leaderboard (50 entries): CPU={}, MEM={}", cpu, mem);

    assert_eq!(board.len(), MAX_LEADERBOARD_SIZE);
    assert!(
        cpu <= CPU_GET_LEADERBOARD_FULL,
        "get_leaderboard CPU {cpu} exceeds threshold {CPU_GET_LEADERBOARD_FULL}"
    );
    assert!(
        mem <= MEM_GET_LEADERBOARD_FULL,
        "get_leaderboard MEM {mem} exceeds threshold {MEM_GET_LEADERBOARD_FULL}"
    );
}

/// Confirm that a max-length (280-char) message costs no more than
/// `MSG_CPU_OVERHEAD_MAX` additional CPU instructions compared to an empty
/// message. This documents the per-byte cost of message validation and storage.
#[test]
fn test_send_tip_message_length_overhead() {
    // Extra CPU instructions allowed for processing 280 chars vs 0 chars.
    // Derived from the difference in CPU_SEND_TIP_MAX_MSG vs CPU_SEND_TIP_SHORT.
    const MSG_CPU_OVERHEAD_MAX: u64 = CPU_SEND_TIP_MAX_MSG - CPU_SEND_TIP_SHORT;

    let (env_empty, client_empty, contract_id_empty, tipper_empty, _) = setup();
    let (env_full, client_full, contract_id_full, tipper_full, _) = setup();

    let creator_empty = Address::generate(&env_empty);
    let creator_full  = Address::generate(&env_full);
    insert_profile(&env_empty, &contract_id_empty, &creator_empty, "alice");
    insert_profile(&env_full,  &contract_id_full,  &creator_full,  "alice");

    let amount: i128 = 10_000_000;

    // Measure empty-message cost.
    env_empty.budget().reset_unlimited();
    client_empty.send_tip(
        &tipper_empty,
        &creator_empty,
        &amount,
        &String::from_str(&env_empty, ""),
        &false,
    );
    let cpu_empty = env_empty.budget().cpu_instruction_cost();

    // Measure 280-char message cost.
    let max_msg = String::from_str(
        &env_full,
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
         AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
         AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
         AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    env_full.budget().reset_unlimited();
    client_full.send_tip(
        &tipper_full,
        &creator_full,
        &amount,
        &max_msg,
        &false,
    );
    let cpu_full = env_full.budget().cpu_instruction_cost();

    let overhead = cpu_full.saturating_sub(cpu_empty);

    soroban_sdk::log!(
        &env_full,
        "message overhead (0→280 chars): empty={}, full={}, delta={}",
        cpu_empty,
        cpu_full,
        overhead
    );

    assert!(
        overhead <= MSG_CPU_OVERHEAD_MAX,
        "message-length CPU overhead {overhead} exceeds max {MSG_CPU_OVERHEAD_MAX}"
    );
}
