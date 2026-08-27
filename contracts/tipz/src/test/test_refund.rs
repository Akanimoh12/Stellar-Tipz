//! Tests for the refund mechanism.

#![cfg(test)]

use crate::types::{RefundConfig, RefundStatus};
use crate::{TipzContract, TipzContractClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, Address, Env, String,
};

fn setup_test_env() -> (Env, Address, TipzContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    (env, contract_id, client)
}

fn initialize_contract(
    env: &Env,
    client: &TipzContractClient,
    admin: &Address,
    fee_collector: &Address,
) -> (Address, token::StellarAssetClient<'static>) {
    let token_admin = Address::generate(env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let native_token = token_contract.address();
    
    // Mint some tokens for testing
    let token_admin_client = token::StellarAssetClient::new(env, &native_token);
    token_admin_client.mint(admin, &10_000_000_000);
    
    client.initialize(admin, fee_collector, &200, &native_token);
    (native_token, token_admin_client)
}

fn register_profile(
    client: &TipzContractClient,
    user: &Address,
    username: &str,
) {
    let env = &client.env;
    client.register_profile(
        user,
        &String::from_str(env, username),
        &String::from_str(env, username),
        &String::from_str(env, "Bio"),
        &String::from_str(env, ""),
        &String::from_str(env, ""),
    );
}

#[test]
fn test_refund_within_window() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send a tip
    let tip_amount = 1_000_000_i128;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let tip_id = 0_u32;

    // Request refund within window
    client.request_refund(&tipper, &tip_id);

    // Verify refund request exists
    let refund_request = client.get_refund_request(&tip_id).unwrap();
    assert_eq!(refund_request.tip_id, tip_id);
    assert_eq!(refund_request.tipper, tipper);
    assert_eq!(refund_request.creator, creator);
    assert_eq!(refund_request.amount, tip_amount);
    assert_eq!(refund_request.status, RefundStatus::Pending);

    // Calculate expected refund (2% non-refundable fee)
    let expected_fee = tip_amount * 200 / 10_000;
    let expected_refund = tip_amount - expected_fee;
    assert_eq!(refund_request.refund_amount, expected_refund);
    assert_eq!(refund_request.non_refundable_fee, expected_fee);

    // Creator approves refund
    client.approve_refund(&creator, &tip_id);

    // Verify refund was processed
    let updated_request = client.get_refund_request(&tip_id).unwrap();
    assert_eq!(updated_request.status, RefundStatus::Approved);
    assert!(updated_request.processed_at.is_some());

    // Verify creator's balance was reduced
    let creator_profile = client.get_profile(&creator);
    assert_eq!(creator_profile.profile.balance, 0);
    assert_eq!(creator_profile.profile.total_tips_received, 0);
    assert_eq!(creator_profile.profile.total_tips_count, 0);
}

#[test]
fn test_refund_after_window_fails() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send a tip
    let tip_amount = 1_000_000_i128;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let tip_id = 0_u32;

    // Advance time beyond refund window (25 hours)
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 25 * 3600,
        protocol_version: 20,
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });

    // Try to request refund after window
    let result = client.try_request_refund(&tipper, &tip_id);
    assert!(result.is_err());
}

#[test]
fn test_auto_approve_after_timeout() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send a tip
    let tip_amount = 1_000_000_i128;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let tip_id = 0_u32;

    // Request refund
    client.request_refund(&tipper, &tip_id);

    // Advance time beyond response window (49 hours)
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 49 * 3600,
        protocol_version: 20,
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });

    // Process pending refunds
    let mut tip_ids = soroban_sdk::Vec::new(&env);
    tip_ids.push_back(tip_id);
    let processed_count = client.process_pending_refunds(&tip_ids);
    assert_eq!(processed_count, 1);

    // Verify refund was auto-approved
    let refund_request = client.get_refund_request(&tip_id).unwrap();
    assert_eq!(refund_request.status, RefundStatus::AutoApproved);

    // Verify creator's balance was reduced
    let creator_profile = client.get_profile(&creator);
    assert_eq!(creator_profile.profile.balance, 0);
}

#[test]
fn test_creator_rejects_refund() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send a tip
    let tip_amount = 1_000_000_i128;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let tip_id = 0_u32;

    // Request refund
    client.request_refund(&tipper, &tip_id);

    // Creator rejects refund
    client.reject_refund(&creator, &tip_id);

    // Verify refund was rejected
    let refund_request = client.get_refund_request(&tip_id).unwrap();
    assert_eq!(refund_request.status, RefundStatus::Rejected);

    // Verify creator still has the tip
    let creator_profile = client.get_profile(&creator);
    assert_eq!(creator_profile.profile.balance, tip_amount);
    assert_eq!(creator_profile.profile.total_tips_received, tip_amount);
}

#[test]
fn test_refund_already_requested() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send a tip
    let tip_amount = 1_000_000_i128;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let tip_id = 0_u32;

    // Request refund
    client.request_refund(&tipper, &tip_id);

    // Try to request refund again
    let result = client.try_request_refund(&tipper, &tip_id);
    assert!(result.is_err());
}

#[test]
fn test_refund_not_tipper() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);
    let other_user = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send a tip
    let tip_amount = 1_000_000_i128;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let tip_id = 0_u32;

    // Try to request refund as non-tipper
    let result = client.try_request_refund(&other_user, &tip_id);
    assert!(result.is_err());
}

#[test]
fn test_refund_not_creator_approve() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);
    let other_user = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send a tip
    let tip_amount = 1_000_000_i128;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let tip_id = 0_u32;

    // Request refund
    client.request_refund(&tipper, &tip_id);

    // Try to approve as non-creator
    let result = client.try_approve_refund(&other_user, &tip_id);
    assert!(result.is_err());
}

#[test]
fn test_refund_already_processed() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send a tip
    let tip_amount = 1_000_000_i128;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let tip_id = 0_u32;

    // Request refund
    client.request_refund(&tipper, &tip_id);

    // Approve refund
    client.approve_refund(&creator, &tip_id);

    // Try to approve again
    let result = client.try_approve_refund(&creator, &tip_id);
    assert!(result.is_err());

    // Try to reject after approval
    let result = client.try_reject_refund(&creator, &tip_id);
    assert!(result.is_err());
}

#[test]
fn test_refund_tip_not_found() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);

    // Try to request refund for non-existent tip
    let result = client.try_request_refund(&tipper, &999_u32);
    assert!(result.is_err());
}

#[test]
fn test_refund_config_admin_only() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let non_admin = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);

    // Get default config
    let config = client.get_refund_config();
    assert_eq!(config.request_window_secs, 86400); // 24 hours
    assert_eq!(config.response_window_secs, 172800); // 48 hours
    assert_eq!(config.non_refundable_fee_bps, 200); // 2%

    // Admin can update config
    let new_config = RefundConfig {
        request_window_secs: 43200, // 12 hours
        response_window_secs: 86400, // 24 hours
        non_refundable_fee_bps: 300, // 3%
    };
    client.set_refund_config(&admin, &new_config);

    let updated_config = client.get_refund_config();
    assert_eq!(updated_config.request_window_secs, 43200);
    assert_eq!(updated_config.response_window_secs, 86400);
    assert_eq!(updated_config.non_refundable_fee_bps, 300);

    // Non-admin cannot update config
    let result = client.try_set_refund_config(&non_admin, &new_config);
    assert!(result.is_err());
}

#[test]
fn test_refund_updates_credit_score() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send a tip
    let tip_amount = 1_000_000_i128;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let profile_before = client.get_profile(&creator);
    let score_before = profile_before.profile.credit_score;

    let tip_id = 0_u32;

    // Request and approve refund
    client.request_refund(&tipper, &tip_id);
    client.approve_refund(&creator, &tip_id);

    // Verify credit score was recalculated
    let profile_after = client.get_profile(&creator);
    // Score should be lower or equal after refund (less tips received)
    assert!(profile_after.profile.credit_score <= score_before);
}

#[test]
fn test_refund_multiple_tips() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send multiple tips
    let tip_amount = 1_000_000_i128;
    for _ in 0..3 {
        client.send_tip(
            &tipper,
            &creator,
            &tip_amount,
            &String::from_str(&env, "Great work!"),
            &false,
            &false,
        );
    }

    // Request refund for first tip only
    let tip_id = 0_u32;
    client.request_refund(&tipper, &tip_id);
    client.approve_refund(&creator, &tip_id);

    // Verify only one tip was refunded
    let creator_profile = client.get_profile(&creator);
    assert_eq!(creator_profile.profile.total_tips_count, 2);
    assert_eq!(creator_profile.profile.total_tips_received, tip_amount * 2);
}

#[test]
fn test_process_pending_refunds_multiple() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send multiple tips
    let tip_amount = 1_000_000_i128;
    for _ in 0..3 {
        client.send_tip(
            &tipper,
            &creator,
            &tip_amount,
            &String::from_str(&env, "Great work!"),
            &false,
            &false,
        );
    }

    // Request refunds for all tips
    for tip_id in 0..3 {
        client.request_refund(&tipper, &tip_id);
    }

    // Advance time beyond response window
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 49 * 3600,
        protocol_version: 20,
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });

    // Process all pending refunds
    let mut tip_ids = soroban_sdk::Vec::new(&env);
    for tip_id in 0..3 {
        tip_ids.push_back(tip_id);
    }
    let processed_count = client.process_pending_refunds(&tip_ids);
    assert_eq!(processed_count, 3);

    // Verify all refunds were auto-approved
    for tip_id in 0..3 {
        let refund_request = client.get_refund_request(&tip_id).unwrap();
        assert_eq!(refund_request.status, RefundStatus::AutoApproved);
    }
}

#[test]
fn test_process_pending_refunds_from_empty_index() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);

    initialize_contract(&env, &client, &admin, &fee_collector);

    let (processed, next_cursor) = client.process_pending_refunds_from(&0, &10);
    assert_eq!(processed, 0);
    assert_eq!(next_cursor, 0);
}

#[test]
fn test_process_pending_refunds_from_single_page() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    initialize_contract(&env, &client, &admin, &fee_collector);
    register_profile(&client, &creator, "creator");

    client.send_tip(
        &tipper,
        &creator,
        &1_000_000_i128,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );
    client.request_refund(&tipper, &0);

    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 49 * 3600,
        protocol_version: 20,
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });

    let (processed, next_cursor) = client.process_pending_refunds_from(&0, &10);
    assert_eq!(processed, 1);
    assert_eq!(next_cursor, 0);

    let refund_request = client.get_refund_request(&0).unwrap();
    assert_eq!(refund_request.status, RefundStatus::AutoApproved);
}

#[test]
fn test_process_pending_refunds_from_multi_page_resumption() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    initialize_contract(&env, &client, &admin, &fee_collector);
    register_profile(&client, &creator, "creator");

    for _ in 0..4 {
        client.send_tip(
            &tipper,
            &creator,
            &1_000_000_i128,
            &String::from_str(&env, "Great work!"),
            &false,
            &false,
        );
    }
    for tip_id in 0..4 {
        client.request_refund(&tipper, &tip_id);
    }

    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 49 * 3600,
        protocol_version: 20,
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });

    let (processed1, cursor1) = client.process_pending_refunds_from(&0, &2);
    assert_eq!(processed1, 2);
    assert!(cursor1 > 0);

    let (processed2, cursor2) = client.process_pending_refunds_from(&cursor1, &2);
    assert_eq!(processed2, 2);
    assert_eq!(cursor2, 0);
}

#[test]
fn test_process_pending_refunds_from_handles_mid_walk_mutation() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    initialize_contract(&env, &client, &admin, &fee_collector);
    register_profile(&client, &creator, "creator");

    for _ in 0..3 {
        client.send_tip(
            &tipper,
            &creator,
            &1_000_000_i128,
            &String::from_str(&env, "Great work!"),
            &false,
            &false,
        );
    }
    for tip_id in 0..3 {
        client.request_refund(&tipper, &tip_id);
    }

    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + 49 * 3600,
        protocol_version: 20,
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });

    let (processed1, cursor1) = client.process_pending_refunds_from(&0, &1);
    assert_eq!(processed1, 1);
    assert!(cursor1 > 0);

    client.approve_refund(&creator, &1);

    let (processed2, cursor2) = client.process_pending_refunds_from(&cursor1, &10);
    assert!(processed2 >= 1);
    assert_eq!(cursor2, 0);

    let request0 = client.get_refund_request(&0).unwrap();
    let request1 = client.get_refund_request(&1).unwrap();
    let request2 = client.get_refund_request(&2).unwrap();

    assert_eq!(request0.status, RefundStatus::AutoApproved);
    assert_eq!(request1.status, RefundStatus::Approved);
    assert_eq!(request2.status, RefundStatus::AutoApproved);
}

#[test]
fn test_refund_no_request_exists() {
    let (env, _contract_id, client) = setup_test_env();
    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);

    let (_native_token, token_admin_client) = initialize_contract(&env, &client, &admin, &fee_collector);
    token_admin_client.mint(&tipper, &10_000_000_000);
    register_profile(&client, &creator, "creator");

    // Send a tip
    let tip_amount = 1_000_000_i128;
    client.send_tip(
        &tipper,
        &creator,
        &tip_amount,
        &String::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let tip_id = 0_u32;

    // Try to approve refund without requesting first
    let result = client.try_approve_refund(&creator, &tip_id);
    assert!(result.is_err());

    // Try to reject refund without requesting first
    let result = client.try_reject_refund(&creator, &tip_id);
    assert!(result.is_err());
}
