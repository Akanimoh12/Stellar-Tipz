//! Tests for get_config query function.

use crate::errors::ContractError;
use crate::TipzContract;
use crate::TipzContractClient;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, TipzContractClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let native_token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();

    (env, client, admin, fee_collector, native_token)
}

#[test]
fn test_get_config_returns_all_fields() {
    let (_env, client, admin, fee_collector, native_token) = setup();

    client.initialize(&admin, &fee_collector, &200_u32, &native_token);

    let config = client.get_config();

    assert_eq!(config.admin, admin);
    assert_eq!(config.fee_collector, fee_collector);
    assert_eq!(config.fee_bps, 200);
    assert_eq!(config.native_token, native_token);
    assert_eq!(config.total_creators, 0);
    assert_eq!(config.total_tips_count, 0);
    assert_eq!(config.total_tips_volume, 0);
    assert_eq!(config.total_fees_collected, 0);
    assert_eq!(config.is_initialized, true);
    assert_eq!(config.version, 1);
}

#[test]
fn test_get_config_not_initialized() {
    let (_env, client, _admin, _fee_collector, _native_token) = setup();

    let result = client.try_get_config();
    assert!(result.is_err());
    match result {
        Err(Ok(err)) => assert_eq!(err, ContractError::NotInitialized),
        _ => panic!("Expected NotInitialized error"),
    }
}

#[test]
fn test_get_config_superset_of_get_stats() {
    let (_env, client, admin, fee_collector, native_token) = setup();

    client.initialize(&admin, &fee_collector, &150_u32, &native_token);

    let config = client.get_config();
    let stats = client.get_stats();

    // Verify get_config contains all get_stats fields
    assert_eq!(config.total_creators, stats.total_creators);
    assert_eq!(config.total_tips_count, stats.total_tips_count);
    assert_eq!(config.total_tips_volume, stats.total_tips_volume);
    assert_eq!(config.total_fees_collected, stats.total_fees_collected);
    assert_eq!(config.fee_bps, stats.fee_bps);

    // Verify get_config has additional fields
    assert_eq!(config.admin, admin);
    assert_eq!(config.fee_collector, fee_collector);
    assert_eq!(config.native_token, native_token);
    assert_eq!(config.is_initialized, true);
    assert_eq!(config.version, 1);
}
