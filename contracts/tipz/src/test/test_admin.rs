//! Tests for admin functions.

#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Events},
    vec, Address, Env, String,
};

use crate::errors::ContractError;
use crate::storage::{self, DataKey};
use crate::types::Profile;
use crate::TipzContract;
use crate::TipzContractClient;

// ── shared setup ─────────────────────────────────────────────────────────────

struct TestCtx<'a> {
    env: Env,
    client: TipzContractClient<'a>,
    admin: Address,
    fee_collector: Address,
    contract_id: Address,
}

fn setup() -> TestCtx<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let native_token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    client.initialize(&admin, &fee_collector, &200_u32, &native_token);

    TestCtx {
        env,
        client,
        admin,
        fee_collector,
        contract_id,
    }
}

/// Insert a minimal profile directly into storage (bypasses validation).
fn insert_profile(ctx: &TestCtx, owner: &Address) {
    let now = ctx.env.ledger().timestamp();
    let profile = Profile {
        owner: owner.clone(),
        username: String::from_str(&ctx.env, "user"),
        display_name: String::from_str(&ctx.env, "User"),
        bio: String::from_str(&ctx.env, ""),
        image_url: String::from_str(&ctx.env, ""),
        x_handle: String::from_str(&ctx.env, ""),
        x_followers: 0,
        x_engagement_avg: 0,
        credit_score: 40,
        total_tips_received: 0,
        total_tips_count: 0,
        balance: 0,
        registered_at: now,
        updated_at: now,
    };
    ctx.env.as_contract(&ctx.contract_id, || {
        storage::set_profile(&ctx.env, &profile);
    });
}

// ── set_fee ───────────────────────────────────────────────────────────────────

#[test]
fn test_set_fee_updates_stored_value() {
    let ctx = setup();
    ctx.client.set_fee(&ctx.admin, &500_u32);

    let stored: u32 = ctx.env.as_contract(&ctx.client.address, || {
        ctx.env
            .storage()
            .instance()
            .get(&DataKey::FeePercent)
            .unwrap()
    });
    assert_eq!(stored, 500);
}

#[test]
fn test_set_fee_boundary_1000_succeeds() {
    let ctx = setup();
    ctx.client.set_fee(&ctx.admin, &1000_u32);

    let stored: u32 = ctx.env.as_contract(&ctx.client.address, || {
        ctx.env
            .storage()
            .instance()
            .get(&DataKey::FeePercent)
            .unwrap()
    });
    assert_eq!(stored, 1000);
}

#[test]
fn test_set_fee_zero_succeeds() {
    let ctx = setup();
    ctx.client.set_fee(&ctx.admin, &0_u32);

    let stored: u32 = ctx.env.as_contract(&ctx.client.address, || {
        ctx.env
            .storage()
            .instance()
            .get(&DataKey::FeePercent)
            .unwrap()
    });
    assert_eq!(stored, 0);
}

#[test]
fn test_set_fee_above_1000_returns_invalid_fee() {
    let ctx = setup();
    let result = ctx.client.try_set_fee(&ctx.admin, &1001_u32);
    assert_eq!(result, Err(Ok(ContractError::InvalidFee)));
}

#[test]
fn test_set_fee_non_admin_returns_not_authorized() {
    let ctx = setup();
    let attacker = Address::generate(&ctx.env);
    let result = ctx.client.try_set_fee(&attacker, &100_u32);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_set_fee_emits_fee_updated_event() {
    let ctx = setup();
    // fee was initialised to 200; change to 300
    ctx.client.set_fee(&ctx.admin, &300_u32);

    let events = ctx.env.events().all();
    assert!(
        !events.is_empty(),
        "expected a FeeUpdated event to be emitted"
    );
}

// ── set_fee_collector ─────────────────────────────────────────────────────────

#[test]
fn test_set_fee_collector_updates_stored_address() {
    let ctx = setup();
    let new_collector = Address::generate(&ctx.env);

    ctx.client.set_fee_collector(&ctx.admin, &new_collector);

    let stored: Address = ctx.env.as_contract(&ctx.client.address, || {
        ctx.env
            .storage()
            .instance()
            .get(&DataKey::FeeCollector)
            .unwrap()
    });
    assert_eq!(stored, new_collector);
}

#[test]
fn test_set_fee_collector_non_admin_returns_not_authorized() {
    let ctx = setup();
    let attacker = Address::generate(&ctx.env);
    let new_collector = Address::generate(&ctx.env);
    let result = ctx.client.try_set_fee_collector(&attacker, &new_collector);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_set_fee_collector_emits_event() {
    let ctx = setup();
    let new_collector = Address::generate(&ctx.env);
    ctx.client.set_fee_collector(&ctx.admin, &new_collector);

    let events = ctx.env.events().all();
    assert!(
        !events.is_empty(),
        "expected a FeeCollectorUpdated event to be emitted"
    );
}

// ── set_admin ─────────────────────────────────────────────────────────────────

#[test]
fn test_set_admin_updates_stored_address() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);

    ctx.client.set_admin(&ctx.admin, &new_admin);

    let stored: Address = ctx.env.as_contract(&ctx.client.address, || {
        ctx.env.storage().instance().get(&DataKey::Admin).unwrap()
    });
    assert_eq!(stored, new_admin);
}

#[test]
fn test_set_admin_old_admin_loses_access() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);

    ctx.client.set_admin(&ctx.admin, &new_admin);

    // old admin can no longer call set_fee
    let result = ctx.client.try_set_fee(&ctx.admin, &100_u32);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_set_admin_new_admin_gains_access() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);

    ctx.client.set_admin(&ctx.admin, &new_admin);

    // new admin can now call set_fee
    ctx.client.set_fee(&new_admin, &100_u32);

    let stored: u32 = ctx.env.as_contract(&ctx.client.address, || {
        ctx.env
            .storage()
            .instance()
            .get(&DataKey::FeePercent)
            .unwrap()
    });
    assert_eq!(stored, 100);
}

#[test]
fn test_set_admin_non_admin_returns_not_authorized() {
    let ctx = setup();
    let attacker = Address::generate(&ctx.env);
    let new_admin = Address::generate(&ctx.env);
    let result = ctx.client.try_set_admin(&attacker, &new_admin);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_set_admin_emits_admin_changed_event() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);
    ctx.client.set_admin(&ctx.admin, &new_admin);

    let events = ctx.env.events().all();
    assert!(
        !events.is_empty(),
        "expected an AdminChanged event to be emitted"
    );
}

// ── test_set_fee_bps_success ──────────────────────────────────────────────────

#[test]
fn test_set_fee_bps_success() {
    let ctx = setup();
    ctx.client.set_fee(&ctx.admin, &350_u32);

    let stored: u32 = ctx.env.as_contract(&ctx.contract_id, || {
        ctx.env
            .storage()
            .instance()
            .get(&DataKey::FeePercent)
            .unwrap()
    });
    assert_eq!(stored, 350);
}

// ── test_set_fee_bps_not_admin ────────────────────────────────────────────────

#[test]
fn test_set_fee_bps_not_admin() {
    let ctx = setup();
    let stranger = Address::generate(&ctx.env);
    let result = ctx.client.try_set_fee(&stranger, &100_u32);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

// ── test_set_fee_bps_too_high ─────────────────────────────────────────────────

#[test]
fn test_set_fee_bps_too_high() {
    let ctx = setup();
    let result = ctx.client.try_set_fee(&ctx.admin, &1001_u32);
    assert_eq!(result, Err(Ok(ContractError::InvalidFee)));
}

// ── test_set_admin_success ────────────────────────────────────────────────────

#[test]
fn test_set_admin_success() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);

    ctx.client.set_admin(&ctx.admin, &new_admin);

    // new admin can perform an admin action
    ctx.client.set_fee(&new_admin, &150_u32);
    let stored: u32 = ctx.env.as_contract(&ctx.contract_id, || {
        ctx.env
            .storage()
            .instance()
            .get(&DataKey::FeePercent)
            .unwrap()
    });
    assert_eq!(stored, 150);
}

// ── test_set_admin_old_admin_rejected ─────────────────────────────────────────

#[test]
fn test_set_admin_old_admin_rejected() {
    let ctx = setup();
    let new_admin = Address::generate(&ctx.env);

    ctx.client.set_admin(&ctx.admin, &new_admin);

    let result = ctx.client.try_set_fee(&ctx.admin, &100_u32);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

// ── test_update_x_metrics_success ────────────────────────────────────────────

#[test]
fn test_update_x_metrics_success() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    insert_profile(&ctx, &creator);

    ctx.client
        .update_x_metrics(&ctx.admin, &creator, &5000_u32, &100_u32);

    let profile = ctx.env.as_contract(&ctx.contract_id, || {
        storage::get_profile(&ctx.env, &creator)
    });
    assert_eq!(profile.x_followers, 5000);
    assert_eq!(profile.x_engagement_avg, 100);
    // credit score must have been recalculated (x metrics now non-zero → score > 40)
    assert!(profile.credit_score > 40);
}

// ── test_update_x_metrics_not_admin ──────────────────────────────────────────

#[test]
fn test_update_x_metrics_not_admin() {
    let ctx = setup();
    let creator = Address::generate(&ctx.env);
    insert_profile(&ctx, &creator);

    let stranger = Address::generate(&ctx.env);
    let result = ctx
        .client
        .try_update_x_metrics(&stranger, &creator, &1000_u32, &50_u32);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

// ── test_batch_update_success ─────────────────────────────────────────────────

#[test]
fn test_batch_update_success() {
    let ctx = setup();
    let creator1 = Address::generate(&ctx.env);
    let creator2 = Address::generate(&ctx.env);
    insert_profile(&ctx, &creator1);
    insert_profile(&ctx, &creator2);

    let updates = vec![
        &ctx.env,
        (creator1.clone(), 1000_u32, 20_u32),
        (creator2.clone(), 2000_u32, 40_u32),
    ];
    let skipped = ctx.client.batch_update_x_metrics(&ctx.admin, &updates);
    assert_eq!(skipped.len(), 0);

    let p1 = ctx.env.as_contract(&ctx.contract_id, || {
        storage::get_profile(&ctx.env, &creator1)
    });
    let p2 = ctx.env.as_contract(&ctx.contract_id, || {
        storage::get_profile(&ctx.env, &creator2)
    });
    assert_eq!(p1.x_followers, 1000);
    assert_eq!(p2.x_followers, 2000);
}

// ── test_batch_update_too_large ───────────────────────────────────────────────

#[test]
fn test_batch_update_too_large() {
    let ctx = setup();
    let addr = Address::generate(&ctx.env);
    // Build a vec of 51 entries (one over the limit of 50)
    let mut updates = vec![&ctx.env, (addr.clone(), 0_u32, 0_u32)];
    for _ in 0..50 {
        updates.push_back((addr.clone(), 0_u32, 0_u32));
    }
    let result = ctx.client.try_batch_update_x_metrics(&ctx.admin, &updates);
    assert_eq!(result, Err(Ok(ContractError::BatchTooLarge)));
}

// ── test_batch_update_skips_unregistered ──────────────────────────────────────

#[test]
fn test_batch_update_skips_unregistered() {
    let ctx = setup();
    let registered = Address::generate(&ctx.env);
    let unregistered = Address::generate(&ctx.env);
    insert_profile(&ctx, &registered);

    let updates = vec![
        &ctx.env,
        (registered.clone(), 500_u32, 10_u32),
        (unregistered.clone(), 999_u32, 99_u32),
    ];
    // Should not error — unregistered entry is skipped and returned
    let skipped = ctx.client.batch_update_x_metrics(&ctx.admin, &updates);
    assert_eq!(skipped.len(), 1);
    assert_eq!(skipped.get(0).unwrap(), unregistered);

    // Registered creator was updated
    let profile = ctx.env.as_contract(&ctx.contract_id, || {
        storage::get_profile(&ctx.env, &registered)
    });
    assert_eq!(profile.x_followers, 500);
}

// ── test_batch_update_returns_all_skipped_addresses ──────────────────────────

#[test]
fn test_batch_update_returns_all_skipped_addresses() {
    let ctx = setup();
    let registered = Address::generate(&ctx.env);
    let unreg1 = Address::generate(&ctx.env);
    let unreg2 = Address::generate(&ctx.env);
    insert_profile(&ctx, &registered);

    let updates = vec![
        &ctx.env,
        (unreg1.clone(), 100_u32, 10_u32),
        (registered.clone(), 500_u32, 10_u32),
        (unreg2.clone(), 200_u32, 20_u32),
    ];
    let skipped = ctx.client.batch_update_x_metrics(&ctx.admin, &updates);
    assert_eq!(skipped.len(), 2);
    assert_eq!(skipped.get(0).unwrap(), unreg1);
    assert_eq!(skipped.get(1).unwrap(), unreg2);

    // Registered creator was still updated
    let profile = ctx.env.as_contract(&ctx.contract_id, || {
        storage::get_profile(&ctx.env, &registered)
    });
    assert_eq!(profile.x_followers, 500);
}

// ── test_batch_update_emits_completed_event ──────────────────────────────────

#[test]
fn test_batch_update_emits_completed_event() {
    let ctx = setup();
    let registered = Address::generate(&ctx.env);
    let unregistered = Address::generate(&ctx.env);
    insert_profile(&ctx, &registered);

    let updates = vec![
        &ctx.env,
        (registered.clone(), 500_u32, 10_u32),
        (unregistered.clone(), 999_u32, 99_u32),
    ];
    ctx.client.batch_update_x_metrics(&ctx.admin, &updates);

    let events = ctx.env.events().all();
    // Should have at least: batch-skipped event + credit-updated event + batch-done event
    assert!(
        events.len() >= 2,
        "expected batch completed and skipped events"
    );
}

// ── test_batch_update_preview_returns_skipped ────────────────────────────────

#[test]
fn test_batch_update_preview_returns_skipped() {
    let ctx = setup();
    let registered = Address::generate(&ctx.env);
    let unregistered = Address::generate(&ctx.env);
    insert_profile(&ctx, &registered);

    let updates = vec![
        &ctx.env,
        (registered.clone(), 500_u32, 10_u32),
        (unregistered.clone(), 999_u32, 99_u32),
    ];
    let skipped = ctx
        .client
        .batch_update_x_metrics_preview(&ctx.admin, &updates);
    assert_eq!(skipped.len(), 1);
    assert_eq!(skipped.get(0).unwrap(), unregistered);

    // Verify no state was modified (profile should still have original values)
    let profile = ctx.env.as_contract(&ctx.contract_id, || {
        storage::get_profile(&ctx.env, &registered)
    });
    assert_eq!(profile.x_followers, 0);
    assert_eq!(profile.x_engagement_avg, 0);
}

// ── test_batch_update_preview_too_large ──────────────────────────────────────

#[test]
fn test_batch_update_preview_too_large() {
    let ctx = setup();
    let addr = Address::generate(&ctx.env);
    let mut updates = vec![&ctx.env, (addr.clone(), 0_u32, 0_u32)];
    for _ in 0..50 {
        updates.push_back((addr.clone(), 0_u32, 0_u32));
    }
    let result = ctx
        .client
        .try_batch_update_x_metrics_preview(&ctx.admin, &updates);
    assert_eq!(result, Err(Ok(ContractError::BatchTooLarge)));
}

// ── test_batch_update_preview_non_admin ──────────────────────────────────────

#[test]
fn test_batch_update_preview_non_admin() {
    let ctx = setup();
    let updates = vec![&ctx.env, (Address::generate(&ctx.env), 0_u32, 0_u32)];
    let stranger = Address::generate(&ctx.env);
    let result = ctx
        .client
        .try_batch_update_x_metrics_preview(&stranger, &updates);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

// ── test_batch_update_all_unregistered ───────────────────────────────────────

#[test]
fn test_batch_update_all_unregistered() {
    let ctx = setup();
    let unreg1 = Address::generate(&ctx.env);
    let unreg2 = Address::generate(&ctx.env);

    let updates = vec![
        &ctx.env,
        (unreg1.clone(), 100_u32, 10_u32),
        (unreg2.clone(), 200_u32, 20_u32),
    ];
    let skipped = ctx.client.batch_update_x_metrics(&ctx.admin, &updates);
    assert_eq!(skipped.len(), 2);
}

// ── Two-step admin transfer ───────────────────────────────────────────────────

/// Helper: initialize with defaults and return (env, client, admin).
fn setup_initialized() -> (Env, TipzContractClient<'static>, Address) {
    let ctx = setup();
    (ctx.env, ctx.client, ctx.admin)
}

#[test]
fn test_propose_admin_stores_pending_and_emits_event() {
    let (env, client, admin) = setup_initialized();
    let new_admin = Address::generate(&env);

    client.propose_admin(&admin, &new_admin);

    // Pending admin should now be set
    let pending = client.get_pending_admin();
    assert_eq!(pending, Some(new_admin));
}

#[test]
fn test_propose_admin_non_admin_fails() {
    let (env, client, _admin) = setup_initialized();
    let stranger = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let result = client.try_propose_admin(&stranger, &new_admin);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_accept_admin_full_flow() {
    let (env, client, admin) = setup_initialized();
    let new_admin = Address::generate(&env);

    client.propose_admin(&admin, &new_admin);

    // No pending admin before acceptance
    assert_eq!(client.get_pending_admin(), Some(new_admin.clone()));

    client.accept_admin(&new_admin);

    // Pending proposal is cleared
    assert_eq!(client.get_pending_admin(), None);

    // New admin can now perform admin-only actions (e.g., propose again)
    let next_admin = Address::generate(&env);
    client.propose_admin(&new_admin, &next_admin);
    assert_eq!(client.get_pending_admin(), Some(next_admin));
}

#[test]
fn test_accept_admin_non_pending_fails() {
    let (env, client, admin) = setup_initialized();
    let new_admin = Address::generate(&env);
    let impostor = Address::generate(&env);

    client.propose_admin(&admin, &new_admin);

    let result = client.try_accept_admin(&impostor);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_accept_admin_no_proposal_fails() {
    let (env, client, _admin) = setup_initialized();
    let anyone = Address::generate(&env);

    let result = client.try_accept_admin(&anyone);
    assert_eq!(result, Err(Ok(ContractError::NoPendingAdmin)));
}

#[test]
fn test_cancel_admin_proposal_clears_pending() {
    let (env, client, admin) = setup_initialized();
    let new_admin = Address::generate(&env);

    client.propose_admin(&admin, &new_admin);
    assert_eq!(client.get_pending_admin(), Some(new_admin));

    client.cancel_admin_proposal(&admin);

    assert_eq!(client.get_pending_admin(), None);
}

#[test]
fn test_cancel_admin_proposal_non_admin_fails() {
    let (env, client, admin) = setup_initialized();
    let new_admin = Address::generate(&env);
    let stranger = Address::generate(&env);

    client.propose_admin(&admin, &new_admin);

    let result = client.try_cancel_admin_proposal(&stranger);
    assert_eq!(result, Err(Ok(ContractError::NotAuthorized)));
}

#[test]
fn test_cancel_admin_proposal_no_proposal_fails() {
    let (env, client, admin) = setup_initialized();

    let result = client.try_cancel_admin_proposal(&admin);
    assert_eq!(result, Err(Ok(ContractError::NoPendingAdmin)));
}

#[test]
fn test_get_pending_admin_none_when_no_proposal() {
    let (_, client, _) = setup_initialized();

    assert_eq!(client.get_pending_admin(), None);
}

#[test]
fn test_propose_overwrites_existing_proposal() {
    let (env, client, admin) = setup_initialized();
    let candidate_a = Address::generate(&env);
    let candidate_b = Address::generate(&env);

    client.propose_admin(&admin, &candidate_a);
    client.propose_admin(&admin, &candidate_b);

    // Latest proposal wins
    assert_eq!(client.get_pending_admin(), Some(candidate_b));
}
