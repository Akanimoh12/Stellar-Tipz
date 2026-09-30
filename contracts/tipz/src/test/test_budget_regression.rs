//! Budget regression tests against committed baselines (issue #1194).
//!
//! Each test re-runs an operation from `test_budget.rs`, compares the measured
//! CPU and memory cost against the baselines in `budget_baselines.toml`, and
//! **fails if either metric exceeds `baseline × (1 + tolerance)`**.
//!
//! ## Updating baselines
//!
//! When a deliberate change raises the cost of an entry point:
//!
//! 1. Set `TIPZ_UPDATE_BASELINES=1` in your shell.
//! 2. Run `cargo test --features testutils 2>&1 | grep -E "BASELINE|budget"`.
//! 3. Copy the printed values into `budget_baselines.toml`.
//! 4. Commit both the code change and the updated `budget_baselines.toml` in one
//!    PR, with a comment explaining the cost increase.
//!
//! ## Tolerance
//!
//! The default tolerance is 10% above baseline (see `budget_baselines.toml`).
//! That is wide enough to absorb ledger-to-ledger noise in the test VM but
//! tight enough to catch a 2× regression immediately.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, Map, String, Symbol};

use crate::{
    leaderboard::MAX_LEADERBOARD_SIZE,
    storage::DataKey,
    types::{Profile, VerificationStatus, VerificationType},
    TipzContract, TipzContractClient,
};

// ── Committed baselines (mirrors budget_baselines.toml) ──────────────────────
// Keep in sync with `budget_baselines.toml`. Values are intentionally higher
// than the last measured run to include the 10% tolerance upfront.

const BASELINE_CPU_REGISTER: u64 = 18_000_000;
const BASELINE_MEM_REGISTER: u64 = 5_000_000;

const BASELINE_CPU_SEND_TIP_SHORT: u64 = 25_000_000;
const BASELINE_MEM_SEND_TIP_SHORT: u64 = 6_000_000;

const BASELINE_CPU_SEND_TIP_MAX_MSG: u64 = 28_000_000;
const BASELINE_MEM_SEND_TIP_MAX_MSG: u64 = 7_000_000;

const BASELINE_CPU_SEND_TIP_FULL_BOARD: u64 = 35_000_000;
const BASELINE_MEM_SEND_TIP_FULL_BOARD: u64 = 9_000_000;

const BASELINE_CPU_WITHDRAW: u64 = 20_000_000;
const BASELINE_MEM_WITHDRAW: u64 = 5_000_000;

const BASELINE_CPU_LEADERBOARD_FULL: u64 = 12_000_000;
const BASELINE_MEM_LEADERBOARD_FULL: u64 = 4_000_000;

/// Regression tolerance: fail if measured > baseline × (1 + TOLERANCE).
const TOLERANCE: f64 = 0.10;

fn threshold(baseline: u64) -> u64 {
    (baseline as f64 * (1.0 + TOLERANCE)) as u64
}

// ── Shared test setup (identical to test_budget.rs) ──────────────────────────

fn setup() -> (
    Env,
    TipzContractClient<'static>,
    Address,
    Address,
    Address,
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
    client.initialize(&admin, &fee_collector, &200_u32, &token_address);
    let tipper = Address::generate(&env);
    token_admin_client.mint(&tipper, &10_000_000_000_000_i128);
    (env, client, contract_id, tipper, token_address)
}

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
        last_active_at: now,
        verification: VerificationStatus {
            is_verified: false,
            verification_type: VerificationType::Unverified,
            verified_at: None,
            revoked_at: None,
        },
        domain: String::from_str(env, ""),
        domain_verified: false,
        domain_verified_at: None,
        custom_min_tip: None,
    };
    env.as_contract(contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Profile(address.clone()), &profile);
    });
}

const BOARD_NAMES: [&str; 50] = [
    "b001","b002","b003","b004","b005","b006","b007","b008","b009","b010",
    "b011","b012","b013","b014","b015","b016","b017","b018","b019","b020",
    "b021","b022","b023","b024","b025","b026","b027","b028","b029","b030",
    "b031","b032","b033","b034","b035","b036","b037","b038","b039","b040",
    "b041","b042","b043","b044","b045","b046","b047","b048","b049","b050",
];

fn fill_leaderboard(env: &Env, contract_id: &Address) {
    let now = env.ledger().timestamp();
    env.as_contract(contract_id, || {
        let mut i: u32 = 0;
        while i < MAX_LEADERBOARD_SIZE {
            let addr = Address::generate(env);
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
                last_active_at: now,
                verification: VerificationStatus {
                    is_verified: false,
                    verification_type: VerificationType::Unverified,
                    verified_at: None,
                    revoked_at: None,
                },
                domain: String::from_str(env, ""),
                domain_verified: false,
                domain_verified_at: None,
                custom_min_tip: None,
            };
            crate::leaderboard::update_leaderboard(env, &profile);
            i += 1;
        }
    });
}

// ── Regression tests ──────────────────────────────────────────────────────────

#[test]
fn regression_register_profile() {
    let (env, client, _, _, _) = setup();
    let caller = Address::generate(&env);
    let username = String::from_str(&env, "abcdefghijklmnopqrstuvwxyz123456");
    let display = String::from_str(&env, "Alice Wonderland — Longest Display Name!!!");
    let bio = String::from_str(&env, "Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do");
    let image = String::from_str(&env, "https://example.com/avatar.png");
    let x = String::from_str(&env, "alice_x");

    env.budget().reset_unlimited();
    client.register_profile(&caller, &username, &display, &bio, &image, &x);
    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "BASELINE register_profile: CPU={} MEM={}", cpu, mem);

    assert!(cpu <= threshold(BASELINE_CPU_REGISTER),
        "register_profile CPU regression: {} > {} (+10% of {})",
        cpu, threshold(BASELINE_CPU_REGISTER), BASELINE_CPU_REGISTER);
    assert!(mem <= threshold(BASELINE_MEM_REGISTER),
        "register_profile MEM regression: {} > {} (+10% of {})",
        mem, threshold(BASELINE_MEM_REGISTER), BASELINE_MEM_REGISTER);
}

#[test]
fn regression_send_tip_short_message() {
    let (env, client, contract_id, tipper, _) = setup();
    let creator = Address::generate(&env);
    insert_profile(&env, &contract_id, &creator, "alice");
    let message = String::from_str(&env, "Great work!");

    env.budget().reset_unlimited();
    client.send_tip(&tipper, &creator, &10_000_000_i128, &message, &false, &false);
    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "BASELINE send_tip_short: CPU={} MEM={}", cpu, mem);

    assert!(cpu <= threshold(BASELINE_CPU_SEND_TIP_SHORT),
        "send_tip (short) CPU regression: {} > {}", cpu, threshold(BASELINE_CPU_SEND_TIP_SHORT));
    assert!(mem <= threshold(BASELINE_MEM_SEND_TIP_SHORT),
        "send_tip (short) MEM regression: {} > {}", mem, threshold(BASELINE_MEM_SEND_TIP_SHORT));
}

#[test]
fn regression_send_tip_max_message() {
    let (env, client, contract_id, tipper, _) = setup();
    let creator = Address::generate(&env);
    insert_profile(&env, &contract_id, &creator, "alice");
    let max_msg = String::from_str(&env,
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
         AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
         AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\
         AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

    env.budget().reset_unlimited();
    client.send_tip(&tipper, &creator, &10_000_000_i128, &max_msg, &false, &false);
    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "BASELINE send_tip_max_msg: CPU={} MEM={}", cpu, mem);

    assert!(cpu <= threshold(BASELINE_CPU_SEND_TIP_MAX_MSG),
        "send_tip (max msg) CPU regression: {} > {}", cpu, threshold(BASELINE_CPU_SEND_TIP_MAX_MSG));
    assert!(mem <= threshold(BASELINE_MEM_SEND_TIP_MAX_MSG),
        "send_tip (max msg) MEM regression: {} > {}", mem, threshold(BASELINE_MEM_SEND_TIP_MAX_MSG));
}

#[test]
fn regression_send_tip_full_leaderboard() {
    let (env, client, contract_id, tipper, _) = setup();
    fill_leaderboard(&env, &contract_id);
    let top = Address::generate(&env);
    insert_profile(&env, &contract_id, &top, "topdog");
    let msg = String::from_str(&env, "");

    env.budget().reset_unlimited();
    client.send_tip(&tipper, &top, &600_000_000_i128, &msg, &false, &false);
    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "BASELINE send_tip_full_board: CPU={} MEM={}", cpu, mem);

    assert!(cpu <= threshold(BASELINE_CPU_SEND_TIP_FULL_BOARD),
        "send_tip (full board) CPU regression: {} > {}", cpu, threshold(BASELINE_CPU_SEND_TIP_FULL_BOARD));
    assert!(mem <= threshold(BASELINE_MEM_SEND_TIP_FULL_BOARD),
        "send_tip (full board) MEM regression: {} > {}", mem, threshold(BASELINE_MEM_SEND_TIP_FULL_BOARD));
}

#[test]
fn regression_withdraw_tips() {
    let (env, client, contract_id, tipper, _) = setup();
    let creator = Address::generate(&env);
    insert_profile(&env, &contract_id, &creator, "alice");
    client.send_tip(&tipper, &creator, &100_000_000_i128, &String::from_str(&env, ""), &false, &false);

    env.budget().reset_unlimited();
    client.withdraw_tips(&creator, &50_000_000_i128);
    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "BASELINE withdraw_tips: CPU={} MEM={}", cpu, mem);

    assert!(cpu <= threshold(BASELINE_CPU_WITHDRAW),
        "withdraw_tips CPU regression: {} > {}", cpu, threshold(BASELINE_CPU_WITHDRAW));
    assert!(mem <= threshold(BASELINE_MEM_WITHDRAW),
        "withdraw_tips MEM regression: {} > {}", mem, threshold(BASELINE_MEM_WITHDRAW));
}

#[test]
fn regression_get_leaderboard_full() {
    let (env, client, contract_id, _, _) = setup();
    fill_leaderboard(&env, &contract_id);

    env.budget().reset_unlimited();
    let board = client.get_leaderboard(&50);
    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    soroban_sdk::log!(&env, "BASELINE get_leaderboard_full: CPU={} MEM={}", cpu, mem);

    assert_eq!(board.len(), MAX_LEADERBOARD_SIZE);
    assert!(cpu <= threshold(BASELINE_CPU_LEADERBOARD_FULL),
        "get_leaderboard CPU regression: {} > {}", cpu, threshold(BASELINE_CPU_LEADERBOARD_FULL));
    assert!(mem <= threshold(BASELINE_MEM_LEADERBOARD_FULL),
        "get_leaderboard MEM regression: {} > {}", mem, threshold(BASELINE_MEM_LEADERBOARD_FULL));
}
