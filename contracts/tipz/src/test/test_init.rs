//! Unit tests for the `initialize` function.
//!
//! Test cases covered:
//! - `test_initialize_success` — valid params, all storage values verified
//! - `test_initialize_already_initialized` — second call returns `AlreadyInitialized`
//! - `test_initialize_invalid_fee_too_high` — fee_bps = 1001 returns `InvalidFee`
//! - `test_initialize_zero_fee` — fee_bps = 0 succeeds
//! - `test_initialize_max_fee` — fee_bps = 1000 succeeds (boundary)

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::errors::ContractError;
use crate::storage::DataKey;
use crate::TipzContract;
use crate::TipzContractClient;

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

pub fn setup_test_contract(env: &Env, admin: &Address) -> TipzContractClient<'static> {
    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(env, &contract_id);
    let fee_collector = Address::generate(env);
    let native_token = env
        .register_stellar_asset_contract_v2(Address::generate(env))
        .address();

    client.initialize(admin, &fee_collector, &200_u32, &native_token);

    client
}

#[test]
fn test_initialize_success() {
    let (env, client, admin, fee_collector, native_token) = setup();
    let fee_bps: u32 = 200;

    client.initialize(&admin, &fee_collector, &fee_bps, &native_token);

    // Verify initialized flag
    let initialized: bool = env.as_contract(&client.address, || {
        env.storage().instance().get(&DataKey::Initialized).unwrap()
    });
    assert!(initialized);

    // Verify admin
    let stored_admin: Address = env.as_contract(&client.address, || {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    });
    assert_eq!(stored_admin, admin);

    // Verify fee collector
    let stored_collector: Address = env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .get(&DataKey::FeeCollector)
            .unwrap()
    });
    assert_eq!(stored_collector, fee_collector);

    // Verify fee bps
    let stored_fee: u32 = env.as_contract(&client.address, || {
        env.storage().instance().get(&DataKey::FeePercent).unwrap()
    });
    assert_eq!(stored_fee, fee_bps);

    // Verify native token
    let stored_token: Address = env.as_contract(&client.address, || {
        env.storage().instance().get(&DataKey::NativeToken).unwrap()
    });
    assert_eq!(stored_token, native_token);

    // Verify all counters are initialized to zero
    let total_creators: u32 = env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .get(&DataKey::TotalCreators)
            .unwrap()
    });
    assert_eq!(total_creators, 0);

    let tip_count: u32 = env.as_contract(&client.address, || {
        env.storage().instance().get(&DataKey::TipCount).unwrap()
    });
    assert_eq!(tip_count, 0);

    let total_volume: i128 = env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .get(&DataKey::TotalTipsVolume)
            .unwrap()
    });
    assert_eq!(total_volume, 0);

    let total_fees: i128 = env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .get(&DataKey::TotalFeesCollected)
            .unwrap()
    });
    assert_eq!(total_fees, 0);
}

#[test]
fn test_initialize_already_initialized() {
    let (_env, client, admin, fee_collector, native_token) = setup();

    client.initialize(&admin, &fee_collector, &200_u32, &native_token);

    let result = client.try_initialize(&admin, &fee_collector, &200_u32, &native_token);
    assert_eq!(result, Err(Ok(ContractError::AlreadyInitialized)));
}

#[test]
fn test_initialize_invalid_fee_too_high() {
    let (_env, client, admin, fee_collector, native_token) = setup();

    let result = client.try_initialize(&admin, &fee_collector, &1001_u32, &native_token);
    assert_eq!(result, Err(Ok(ContractError::InvalidFee)));
}

#[test]
fn test_initialize_zero_fee() {
    let (env, client, admin, fee_collector, native_token) = setup();

    client.initialize(&admin, &fee_collector, &0_u32, &native_token);

    let stored_fee: u32 = env.as_contract(&client.address, || {
        env.storage().instance().get(&DataKey::FeePercent).unwrap()
    });
    assert_eq!(stored_fee, 0);
}

#[test]
fn test_initialize_max_fee() {
    let (env, client, admin, fee_collector, native_token) = setup();

    // 1000 bps = 10%, the maximum allowed value
    client.initialize(&admin, &fee_collector, &1000_u32, &native_token);

    let stored_fee: u32 = env.as_contract(&client.address, || {
        env.storage().instance().get(&DataKey::FeePercent).unwrap()
    });
    assert_eq!(stored_fee, 1000);
}
