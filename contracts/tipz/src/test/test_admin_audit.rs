//! Unit tests for on-chain audit trail of admin actions.

#![cfg(test)]

use soroban_sdk::{
    symbol_short, testutils::{Address as _, Events}, Address, Env, IntoVal, Symbol,
};

use crate::types::AdminAuditEntry;
use crate::TipzContract;
use crate::TipzContractClient;

struct TestCtx<'a> {
    env: Env,
    client: TipzContractClient<'a>,
    admin: Address,
    fee_collector: Address,
}

fn setup() -> TestCtx<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.budget().reset_unlimited();

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
    }
}

#[test]
fn test_admin_audit_trail_recorded_on_actions() {
    let ctx = setup();

    // 1. set_fee
    ctx.client.set_fee(&ctx.admin, &500_u32);

    let history = ctx.client.get_admin_audit_history(&10, &0);
    assert_eq!(history.len(), 1);
    let entry = history.get(0).unwrap();
    assert_eq!(entry.id, 1);
    assert_eq!(entry.actor, ctx.admin);
    assert_eq!(entry.action_kind, Symbol::new(&ctx.env, "set_fee"));
    assert_eq!(entry.before_value, soroban_sdk::String::from_str(&ctx.env, "200"));
    assert_eq!(entry.after_value, soroban_sdk::String::from_str(&ctx.env, "500"));
    assert_eq!(entry.ledger_sequence, ctx.env.ledger().sequence());

    // 2. pause & unpause
    ctx.client.pause(&ctx.admin);
    ctx.client.unpause(&ctx.admin);

    let history = ctx.client.get_admin_audit_history(&10, &0);
    assert_eq!(history.len(), 3);

    // Newest first
    let unpause_entry = history.get(0).unwrap();
    assert_eq!(unpause_entry.action_kind, Symbol::new(&ctx.env, "unpause"));
    assert_eq!(unpause_entry.before_value, soroban_sdk::String::from_str(&ctx.env, "true"));
    assert_eq!(unpause_entry.after_value, soroban_sdk::String::from_str(&ctx.env, "false"));

    let pause_entry = history.get(1).unwrap();
    assert_eq!(pause_entry.action_kind, Symbol::new(&ctx.env, "pause"));
    assert_eq!(pause_entry.before_value, soroban_sdk::String::from_str(&ctx.env, "false"));
    assert_eq!(pause_entry.after_value, soroban_sdk::String::from_str(&ctx.env, "true"));
}

#[test]
fn test_admin_audit_event_emission() {
    let ctx = setup();

    ctx.client.set_fee(&ctx.admin, &350_u32);

    let events = ctx.env.events().all();
    let target_topics = soroban_sdk::vec![
        &ctx.env,
        symbol_short!("admin").into_val(&ctx.env),
        symbol_short!("audit").into_val(&ctx.env),
    ];
    let mut audit_count = 0;
    for e in events.iter() {
        if e.1 == target_topics {
            audit_count += 1;
        }
    }

    assert_eq!(audit_count, 1);
}

#[test]
fn test_admin_audit_pagination() {
    let ctx = setup();

    for i in 1..=10 {
        ctx.client.set_fee(&ctx.admin, &(200 + i * 10));
    }

    let count = ctx.client.get_admin_audit_count();
    assert_eq!(count, 10);

    // Page 1 (limit 3, offset 0) -> items 10, 9, 8
    let page1 = ctx.client.get_admin_audit_history(&3, &0);
    assert_eq!(page1.len(), 3);
    assert_eq!(page1.get(0).unwrap().id, 10);
    assert_eq!(page1.get(1).unwrap().id, 9);
    assert_eq!(page1.get(2).unwrap().id, 8);

    // Page 2 (limit 3, offset 3) -> items 7, 6, 5
    let page2 = ctx.client.get_admin_audit_history(&3, &3);
    assert_eq!(page2.len(), 3);
    assert_eq!(page2.get(0).unwrap().id, 7);
    assert_eq!(page2.get(1).unwrap().id, 6);
    assert_eq!(page2.get(2).unwrap().id, 5);
}

#[test]
fn test_admin_audit_ring_buffer_wraparound() {
    let ctx = setup();

    // Perform 105 admin actions (exceeding 100 capacity)
    for i in 1..=105 {
        ctx.client.set_fee(&ctx.admin, &(100 + (i % 800)));
    }

    let total_count = ctx.client.get_admin_audit_count();
    assert_eq!(total_count, 105);

    let page1 = ctx.client.get_admin_audit_history(&50, &0);
    assert_eq!(page1.len(), 50);
    // Newest entry should have ID 105
    assert_eq!(page1.get(0).unwrap().id, 105);

    let page2 = ctx.client.get_admin_audit_history(&50, &50);
    assert_eq!(page2.len(), 50);
    // Oldest entry retained in ring-buffer (capacity 100) should have ID 6 (105 - 100 + 1)
    assert_eq!(page2.get(49).unwrap().id, 6);

    let page3 = ctx.client.get_admin_audit_history(&50, &100);
    assert_eq!(page3.len(), 0);
}
