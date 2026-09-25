#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, Env, Map, String, Symbol};

use crate::errors::ContractError;
use crate::storage;
use crate::types::Profile;
use crate::{TipzContract, TipzContractClient};

struct Ctx {
    env: Env,
    client: TipzContractClient<'static>,
    contract_id: Address,
    admin: Address,
    creator: Address,
}

fn setup() -> Ctx {
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

    let creator = Address::generate(&env);
    let now = env.ledger().timestamp();
    let profile = Profile {
        owner: creator.clone(),
        username: String::from_str(&env, "alice"),
        display_name: String::from_str(&env, "Alice"),
        bio: String::from_str(&env, "Creator bio"),
        website: String::from_str(&env, ""),
        image_url: String::from_str(&env, ""),
        social_links: Map::<Symbol, String>::new(&env),
        x_handle: String::from_str(&env, "alice_x"),
        x_followers: 1000,
        x_engagement_avg: 50,
        credit_score: 60,
        total_tips_received: 100_000_000,
        total_tips_count: 5,
        balance: 100_000_000,
        registered_at: now,
        updated_at: now,
        verification: crate::types::VerificationStatus::default(),
        domain: String::from_str(&env, ""),
        domain_verified: false,
        domain_verified_at: None,
        custom_min_tip: None,
    };
    env.as_contract(&contract_id, || {
        storage::set_profile(&env, &profile);
    });

    token_admin_client.mint(&contract_id, &1_000_000_000);

    Ctx {
        env,
        client,
        contract_id,
        admin,
        creator,
    }
}

#[test]
fn withdrawals_under_threshold_remain_enabled() {
    let ctx = setup();
    ctx.client
        .set_circuit_breaker_config(&ctx.admin, &true, &70_000_000_i128, &3600_u64, &12_u32);

    ctx.client.withdraw_tips(&ctx.creator, &20_000_000_i128);
    ctx.client.withdraw_tips(&ctx.creator, &30_000_000_i128);

    assert!(!ctx.client.is_paused());
    let status = ctx.client.get_circuit_breaker_status();
    assert!(!status.tripped);
    assert_eq!(status.tripped_at, None);
}

#[test]
fn exceeding_threshold_trips_breaker_and_blocks_withdrawal() {
    let ctx = setup();
    ctx.client
        .set_circuit_breaker_config(&ctx.admin, &true, &60_000_000_i128, &3600_u64, &12_u32);

    ctx.client.withdraw_tips(&ctx.creator, &50_000_000_i128);
    let result = ctx.client.try_withdraw_tips(&ctx.creator, &20_000_000_i128);

    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
    assert!(ctx.client.is_paused());
    let status = ctx.client.get_circuit_breaker_status();
    assert!(status.tripped);
    assert_eq!(status.tripped_at, Some(ctx.env.ledger().timestamp()));
    ctx.env.as_contract(&ctx.contract_id, || {
        assert_eq!(
            storage::get_profile(&ctx.env, &ctx.creator).balance,
            50_000_000
        );
    });
}

#[test]
fn admin_can_reset_tripped_breaker() {
    let ctx = setup();
    ctx.client
        .set_circuit_breaker_config(&ctx.admin, &true, &60_000_000_i128, &3600_u64, &12_u32);

    ctx.client.withdraw_tips(&ctx.creator, &50_000_000_i128);
    let result = ctx.client.try_withdraw_tips(&ctx.creator, &20_000_000_i128);
    assert_eq!(result, Err(Ok(ContractError::ContractPaused)));
    assert!(ctx.client.is_paused());

    ctx.client.reset_circuit_breaker(&ctx.admin);

    assert!(!ctx.client.is_paused());
    assert!(!ctx.client.get_circuit_breaker_status().tripped);
    ctx.client.withdraw_tips(&ctx.creator, &10_000_000_i128);
}

#[test]
fn disabled_breaker_does_not_pause_withdrawals() {
    let ctx = setup();
    ctx.client
        .set_circuit_breaker_config(&ctx.admin, &false, &0_i128, &3600_u64, &12_u32);

    ctx.client.withdraw_tips(&ctx.creator, &90_000_000_i128);

    assert!(!ctx.client.is_paused());
    assert!(!ctx.client.get_circuit_breaker_status().tripped);
}
