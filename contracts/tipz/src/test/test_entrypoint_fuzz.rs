//! Entrypoint-focused fuzz harness.
//!
//! The manifest test intentionally lists every public contract entrypoint from
//! `lib.rs`. When a new entrypoint is added, this test fails until a fuzz case
//! is added here or to `test_fuzz.rs`.

#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String as SorobanString, Vec};

use crate::{TipzContract, TipzContractClient};

const COVERED_ENTRYPOINTS: &[&str] = &[
    "initialize",
    "register_profile",
    "update_profile",
    "deregister_profile",
    "deactivate_profile",
    "reactivate_profile",
    "update_x_metrics",
    "batch_update_x_metrics",
    "batch_update_x_metrics_preview",
    "get_profile",
    "get_profile_by_username",
    "send_tip",
    "send_tip_on_behalf",
    "withdraw_tips",
    "emergency_withdraw_tips",
    "get_paused_at",
    "get_pending_fee_change",
    "get_fee_change_delay_ledgers",
    "get_emergency_withdrawal_delay",
    "migrate",
    "get_migration_state",
    "get_tip",
    "get_recent_tips",
    "get_creator_tip_count",
    "get_tip_count",
    "get_tips_by_tipper",
    "get_tipper_tip_count",
    "block_tipper",
    "unblock_tipper",
    "is_tipper_blocked",
    "get_blocked_tipper_count",
    "calculate_credit_score",
    "get_credit_tier",
    "get_credit_breakdown",
    "get_streak",
    "get_leaderboard",
    "reset_leaderboard",
    "get_leaderboard_rank",
    "get_leaderboard_size",
    "set_fee",
    "propose_fee_change",
    "apply_fee_change",
    "cancel_fee_change",
    "set_fee_change_delay",
    "set_fee_collector",
    "set_admin",
    "propose_admin_change",
    "confirm_admin_change",
    "cancel_admin_change",
    "get_admin_change_proposal",
    "get_admin_change_history",
    "get_admin_audit_history",
    "get_admin_audit_count",
    "get_stats",
    "get_config",
    "bump_ttl",
    "bump_profile_ttl",
    "get_version",
    "propose_upgrade",
    "get_proposed_upgrade",
    "cancel_upgrade",
    "execute_upgrade",
    "upgrade",
    "pause",
    "unpause",
    "is_paused",
    "set_min_tip_amount",
    "get_min_tip_amount",
    "set_min_withdrawal_amount",
    "get_min_withdrawal_amount",
    "set_circuit_breaker_config",
    "reset_circuit_breaker",
    "get_circuit_breaker_config",
    "get_circuit_breaker_status",
    "set_rate_limit_config",
    "get_rate_limit_config",
    "request_verification",
    "approve_verification",
    "revoke_verification",
    "get_verification_status",
    "is_verification_expired",
    "create_subscription",
    "cancel_subscription",
    "execute_due_subscription",
    "execute_subscriptions",
    "get_subscriptions",
    "get_subscribers",
    "set_multisig_config",
    "get_multisig_config",
    "propose_action",
    "approve_action",
    "cancel_proposal",
    "get_pending_proposals",
    "get_proposal",
    "set_donation_page",
    "get_donation_page",
    "set_min_tip",
    "get_creator_min_tip",
    "set_domain",
    "is_profile_inactive_eligible",
    "cleanup_inactive_profile",
    "cleanup_inactive_profiles",
    "verify_domain",
    "set_domain_reverify_interval",
    "get_domain_reverify_interval",
    "get_platform_stats",
    "get_creator_stats",
    "set_goal",
    "get_goal",
    "cancel_goal",
    "get_archived_goals",
    "add_accepted_token",
    "remove_accepted_token",
    "get_accepted_tokens",
    "send_tip_token",
    "withdraw_token",
    "get_token_balances",
    "request_refund",
    "approve_refund",
    "reject_refund",
    "process_pending_refunds",
    "process_pending_refunds_from",
    "expire_refund",
    "get_refund_request",
    "get_refund_config",
    "set_refund_config",
];

fn setup(
    env: &Env,
) -> (
    TipzContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
) {
    env.mock_all_auths();
    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let fee_collector = Address::generate(env);
    let native_token = Address::generate(env);
    let other = Address::generate(env);
    (client, admin, fee_collector, native_token, other)
}

fn s(env: &Env, bytes: &[u8]) -> SorobanString {
    SorobanString::from_bytes(env, bytes)
}

#[test]
fn every_public_entrypoint_has_manifest_coverage() {
    let source = include_str!("../lib.rs");
    let mut actual = std::vec::Vec::new();
    for line in source.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("pub fn ") {
            let name = rest.split('(').next().unwrap();
            actual.push(name);
        }
    }

    actual.sort_unstable();
    let mut expected = COVERED_ENTRYPOINTS.to_vec();
    expected.sort_unstable();
    assert_eq!(actual, expected);
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(32))]

    #[test]
    fn fuzz_uninitialized_entrypoints_return_or_error_without_panicking(
        amount in any::<i128>(),
        small in any::<u32>(),
        bytes in prop::collection::vec(any::<u8>(), 0..=96),
    ) {
        let env = Env::default();
        let (client, admin, fee_collector, native_token, other) = setup(&env);
        let text = s(&env, &bytes);

        let _ = client.try_register_profile(&other, &text, &text, &text, &text, &text);
        let _ = client.try_update_profile(&other, &Some(text.clone()), &Some(text.clone()), &Some(text.clone()), &Some(text.clone()));
        let _ = client.try_deregister_profile(&other);
        let _ = client.try_deactivate_profile(&other, &admin);
        let _ = client.try_reactivate_profile(&other, &admin);
        let _ = client.try_send_tip(&other, &admin, &amount, &text, &false, &false);
        let _ = client.try_send_tip_on_behalf(&other, &fee_collector, &admin, &amount, &text);
        let _ = client.try_withdraw_tips(&other, &amount);
        let _ = client.try_emergency_withdraw_tips(&other, &amount);
        let _ = client.try_get_tip(&small);
        let _ = client.try_calculate_credit_score(&other);
        let _ = client.try_set_fee(&admin, &small);
        let _ = client.try_set_min_tip_amount(&admin, &amount);
        let _ = client.try_set_min_withdrawal_amount(&admin, &amount);
        let _ = client.try_set_circuit_breaker_config(&admin, &true, &amount, &(small as u64), &1_u32);
        let _ = client.try_request_refund(&other, &small);
        let _ = client.try_approve_refund(&other, &small);
        let _ = client.try_reject_refund(&other, &small);
        let _ = client.try_initialize(&admin, &fee_collector, &small, &native_token);
    }

    #[test]
    fn fuzz_initialized_admin_and_query_entrypoints_return_typed_results(
        amount in any::<i128>(),
        n in any::<u32>(),
        seconds in any::<u64>(),
        bytes in prop::collection::vec(any::<u8>(), 0..=64),
    ) {
        let env = Env::default();
        let (client, admin, fee_collector, native_token, other) = setup(&env);
        client.initialize(&admin, &fee_collector, &(n % 1001), &native_token);
        let text = s(&env, &bytes);
        let empty_ids = Vec::new(&env);

        let _ = client.try_update_x_metrics(&admin, &other, &n, &n);
        let _ = client.try_get_profile(&other);
        let _ = client.try_get_profile_by_username(&text);
        let _ = client.get_paused_at();
        let _ = client.get_pending_fee_change();
        let _ = client.get_fee_change_delay_ledgers();
        let _ = client.get_emergency_withdrawal_delay();
        let _ = client.try_migrate(&admin, &n, &n);
        let _ = client.get_migration_state();
        let _ = client.get_recent_tips(&other, &n, &n);
        let _ = client.get_creator_tip_count(&other);
        let _ = client.get_tip_count();
        let _ = client.get_tips_by_tipper(&other, &n);
        let _ = client.get_tipper_tip_count(&other);
        let _ = client.is_tipper_blocked(&other, &admin);
        let _ = client.get_blocked_tipper_count(&other);
        let _ = client.try_get_credit_tier(&other);
        let _ = client.try_get_credit_breakdown(&other);
        let _ = client.try_get_streak(&other, &admin);
        let _ = client.try_get_leaderboard(&crate::types::LeaderboardPeriod::AllTime, &n);
        let _ = client.get_leaderboard_rank(&crate::types::LeaderboardPeriod::AllTime, &other);
        let _ = client.get_leaderboard_size(&crate::types::LeaderboardPeriod::AllTime);
        let _ = client.try_get_stats();
        let _ = client.try_get_config();
        let _ = client.get_version();
        let _ = client.is_paused();
        let _ = client.get_min_tip_amount();
        let _ = client.get_min_withdrawal_amount();
        let _ = client.get_circuit_breaker_config();
        let _ = client.get_circuit_breaker_status();
        let _ = client.get_rate_limit_config();
        let _ = client.try_set_rate_limit_config(&admin, &n, &seconds);
        let _ = client.try_process_pending_refunds(&empty_ids);
        let _ = client.try_process_pending_refunds_from(&n, &n);
        let _ = client.try_expire_refund(&n);
        let _ = client.get_refund_request(&n);
        let _ = client.get_refund_config();
        let _ = client.try_set_refund_config(&admin, &crate::types::RefundConfig {
            request_window_secs: seconds,
            response_window_secs: seconds,
            non_refundable_fee_bps: n,
            request_ttl_ledgers: n,
        });
        let _ = amount;
    }
}
