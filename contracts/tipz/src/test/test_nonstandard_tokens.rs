//! Multi-token tips with non-standard tokens (#1593).
//!
//! A token that charges a transfer fee credits the recipient with less than the
//! amount the sender authorised. Tips in such tokens must be rejected so that the
//! creator's ledger balance never exceeds what the contract actually holds.

#![cfg(test)]

use soroban_sdk::{contract, contractimpl, testutils::Address as _, token, Address, Env, String};

use crate::errors::ContractError;
use crate::{TipzContract, TipzContractClient};

/// Test-only token that burns 10% of every transfer.
#[contract]
pub struct FeeOnTransferToken;

#[contractimpl]
impl FeeOnTransferToken {
    pub fn mint(env: Env, to: Address, amount: i128) {
        let balance = Self::balance(env.clone(), to.clone());
        env.storage().persistent().set(&to, &(balance + amount));
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&id).unwrap_or(0)
    }

    /// Debits `amount` from `from` but credits only `amount - amount / 10` to `to`.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("insufficient balance");
        }
        let fee = amount / 10;
        env.storage().persistent().set(&from, &(from_balance - amount));
        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&to, &(to_balance + amount - fee));
    }
}

fn setup() -> (Env, TipzContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    let native_admin = Address::generate(&env);
    let native_token = env
        .register_stellar_asset_contract_v2(native_admin)
        .address();
    client.initialize(&admin, &fee_collector, &200_u32, &native_token);

    (env, client, admin)
}

fn register_creator(env: &Env, client: &TipzContractClient<'static>, creator: &Address) {
    client.register_profile(
        creator,
        &String::from_str(env, "creator"),
        &String::from_str(env, "Creator"),
        &String::from_str(env, "Bio"),
        &String::from_str(env, ""),
        &String::from_str(env, ""),
    );
}

#[test]
fn standard_token_tip_is_credited_in_full() {
    let (env, client, admin) = setup();

    let token_address = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
    let token_client = token::TokenClient::new(&env, &token_address);

    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);
    token_admin_client.mint(&tipper, &5_000_000);

    client.add_accepted_token(&admin, &token_address, &None);
    register_creator(&env, &client, &creator);

    client.send_tip_token(
        &tipper,
        &creator,
        &1_000_000,
        &token_address,
        &String::from_str(&env, "standard"),
        &false,
    );

    let balances = client.get_token_balances(&creator);
    assert_eq!(balances.len(), 1);
    assert_eq!(balances.get(0).unwrap().amount, 1_000_000);
    assert_eq!(token_client.balance(&tipper), 4_000_000);
}

#[test]
fn fee_on_transfer_token_tip_is_rejected() {
    let (env, client, admin) = setup();

    let token_address = env.register_contract(None, FeeOnTransferToken);
    let token_client = FeeOnTransferTokenClient::new(&env, &token_address);

    let tipper = Address::generate(&env);
    let creator = Address::generate(&env);
    token_client.mint(&tipper, &5_000_000);

    client.add_accepted_token(&admin, &token_address, &None);
    register_creator(&env, &client, &creator);

    let result = client.try_send_tip_token(
        &tipper,
        &creator,
        &1_000_000,
        &token_address,
        &String::from_str(&env, "fee token"),
        &false,
    );

    assert_eq!(result, Err(Ok(ContractError::NonStandardToken)));
    assert!(client.get_token_balances(&creator).is_empty());
}
