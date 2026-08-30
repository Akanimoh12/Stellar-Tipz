//! Snapshot tests for contract storage state (issue #579).
//!
//! These tests intentionally **redact addresses** so snapshots are stable across runs.

#![cfg(test)]

extern crate alloc;

use core::fmt::Debug;
use std::collections::BTreeMap;

use alloc::string::ToString;

use soroban_sdk::{testutils::Address as _, token, Address, Env, String as SorobanString};

use crate::storage::{CacheKey, DataKey};
use crate::types::{Profile, Tip};
use crate::{TipzContract, TipzContractClient};

#[derive(Clone)]
struct AddrCtx {
    contract_id: Address,
    admin: Address,
    fee_collector: Address,
    native_token: Address,
    creator: Address,
    tipper: Address,
}

fn redact_address(addr: &Address, ctx: &AddrCtx) -> &'static str {
    if addr == &ctx.contract_id {
        "<contract>"
    } else if addr == &ctx.admin {
        "<admin>"
    } else if addr == &ctx.fee_collector {
        "<fee_collector>"
    } else if addr == &ctx.native_token {
        "<native_token>"
    } else if addr == &ctx.creator {
        "<creator>"
    } else if addr == &ctx.tipper {
        "<tipper>"
    } else {
        "<address>"
    }
}

fn s(s: &SorobanString) -> std::string::String {
    s.to_string()
}

#[derive(Debug)]
struct ProfileRedacted {
    owner: &'static str,
    username: std::string::String,
    display_name: std::string::String,
    bio: std::string::String,
    image_url: std::string::String,
    x_handle: std::string::String,
    x_followers: u32,
    x_engagement_avg: u32,
    credit_score: u32,
    total_tips_received: i128,
    total_tips_count: u32,
    balance: i128,
    registered_at: u64,
    updated_at: u64,
    verification_is_verified: bool,
}

impl ProfileRedacted {
    fn from_profile(profile: &Profile, ctx: &AddrCtx) -> Self {
        Self {
            owner: redact_address(&profile.owner, ctx),
            username: s(&profile.username),
            display_name: s(&profile.display_name),
            bio: s(&profile.bio),
            image_url: s(&profile.image_url),
            x_handle: s(&profile.x_handle),
            x_followers: profile.x_followers,
            x_engagement_avg: profile.x_engagement_avg,
            credit_score: profile.credit_score,
            total_tips_received: profile.total_tips_received,
            total_tips_count: profile.total_tips_count,
            balance: profile.balance,
            registered_at: profile.registered_at,
            updated_at: profile.updated_at,
            verification_is_verified: profile.verification.is_verified,
        }
    }
}

#[derive(Debug)]
struct TipRedacted {
    id: u32,
    sender: &'static str,
    benefactor: Option<&'static str>,
    creator: &'static str,
    amount: i128,
    message: std::string::String,
    timestamp: u64,
    is_anonymous: bool,
}

impl TipRedacted {
    fn from_tip(tip: &Tip, ctx: &AddrCtx) -> Self {
        Self {
            id: tip.id,
            sender: redact_address(&tip.sender, ctx),
            benefactor: tip.benefactor.as_ref().map(|a| redact_address(a, ctx)),
            creator: redact_address(&tip.creator, ctx),
            amount: tip.amount,
            message: s(&tip.message),
            timestamp: tip.timestamp,
            is_anonymous: tip.is_anonymous,
        }
    }
}

#[derive(Debug)]
struct StorageSnapshot {
    instance_has: BTreeMap<&'static str, bool>,
    persistent_has: BTreeMap<std::string::String, bool>,
    temporary_has: BTreeMap<std::string::String, bool>,
    instance_values: BTreeMap<&'static str, std::string::String>,
    profile: Option<ProfileRedacted>,
    tip0: Option<TipRedacted>,
}

fn put_bool(map: &mut BTreeMap<&'static str, std::string::String>, k: &'static str, v: bool) {
    map.insert(k, if v { "true".into() } else { "false".into() });
}
fn put_u32(map: &mut BTreeMap<&'static str, std::string::String>, k: &'static str, v: u32) {
    map.insert(k, std::format!("{v}"));
}
fn put_i128(map: &mut BTreeMap<&'static str, std::string::String>, k: &'static str, v: i128) {
    map.insert(k, std::format!("{v}"));
}

fn snapshot_storage(env: &Env, contract_id: &Address, ctx: &AddrCtx) -> StorageSnapshot {
    env.as_contract(contract_id, || {
        let mut instance_has: BTreeMap<&'static str, bool> = BTreeMap::new();
        let mut persistent_has: BTreeMap<std::string::String, bool> = BTreeMap::new();
        let mut temporary_has: BTreeMap<std::string::String, bool> = BTreeMap::new();
        let mut instance_values: BTreeMap<&'static str, std::string::String> = BTreeMap::new();

        let instance_keys: [(&'static str, DataKey); 11] = [
            ("Initialized", DataKey::Initialized),
            ("Admin", DataKey::Admin),
            ("FeeCollector", DataKey::FeeCollector),
            ("FeePercent", DataKey::FeePercent),
            ("NativeToken", DataKey::NativeToken),
            ("Paused", DataKey::Paused),
            ("MinTipAmount", DataKey::MinTipAmount),
            ("ContractVersion", DataKey::ContractVersion),
            ("TotalCreators", DataKey::TotalCreators),
            ("TipCount", DataKey::TipCount),
            ("TotalTipsVolume", DataKey::TotalTipsVolume),
        ];

        for (label, key) in instance_keys {
            let has = env.storage().instance().has(&key);
            instance_has.insert(label, has);
        }

        instance_has.insert(
            "Cache.RuntimeConfig",
            env.storage().instance().has(&CacheKey::RuntimeConfig),
        );
        instance_has.insert(
            "Cache.LeaderboardSet",
            env.storage().instance().has(&CacheKey::LeaderboardSet),
        );
        instance_has.insert(
            "Cache.SendTipState",
            env.storage().instance().has(&CacheKey::SendTipState),
        );

        if let Some(v) = env.storage().instance().get::<_, bool>(&DataKey::Initialized) {
            put_bool(&mut instance_values, "Initialized", v);
        }
        if let Some(v) = env.storage().instance().get::<_, u32>(&DataKey::FeePercent) {
            put_u32(&mut instance_values, "FeePercent", v);
        }
        if let Some(v) = env.storage().instance().get::<_, u32>(&DataKey::Paused) {
            put_u32(&mut instance_values, "Paused", v);
        }
        if let Some(v) = env.storage().instance().get::<_, i128>(&DataKey::MinTipAmount) {
            put_i128(&mut instance_values, "MinTipAmount", v);
        }
        if let Some(v) = env.storage().instance().get::<_, u32>(&DataKey::ContractVersion) {
            put_u32(&mut instance_values, "ContractVersion", v);
        }
        if let Some(v) = env.storage().instance().get::<_, u32>(&DataKey::TotalCreators) {
            put_u32(&mut instance_values, "TotalCreators", v);
        }
        if let Some(v) = env.storage().instance().get::<_, u32>(&DataKey::TipCount) {
            put_u32(&mut instance_values, "TipCount", v);
        }
        if let Some(v) = env.storage().instance().get::<_, i128>(&DataKey::TotalTipsVolume) {
            put_i128(&mut instance_values, "TotalTipsVolume", v);
        }

        // Persistent keys (based on known test setup)
        let username = SorobanString::from_str(env, "alice");
        let profile_key = DataKey::Profile(ctx.creator.clone());
        let username_key = DataKey::UsernameToAddress(username);

        persistent_has.insert(
            std::string::String::from("Profile(<creator>)"),
            env.storage().persistent().has(&profile_key),
        );
        persistent_has.insert(
            std::string::String::from("UsernameToAddress(alice)"),
            env.storage().persistent().has(&username_key),
        );

        // Temporary keys
        temporary_has.insert(
            std::string::String::from("Tip(0)"),
            env.storage().temporary().has(&DataKey::Tip(0)),
        );

        let profile = env
            .storage()
            .persistent()
            .get::<_, Profile>(&profile_key)
            .map(|p| ProfileRedacted::from_profile(&p, ctx));

        let tip0 = env
            .storage()
            .temporary()
            .get::<_, Tip>(&DataKey::Tip(0))
            .map(|t| TipRedacted::from_tip(&t, ctx));

        StorageSnapshot {
            instance_has,
            persistent_has,
            temporary_has,
            instance_values,
            profile,
            tip0,
        }
    })
}

fn setup_initialized_env() -> (Env, TipzContractClient<'static>, AddrCtx) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TipzContract);
    let client = TipzContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_address = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);
    client.initialize(&admin, &fee_collector, &200_u32, &token_address);

    let creator = Address::generate(&env);
    let tipper = Address::generate(&env);

    (
        env,
        client,
        AddrCtx {
            contract_id,
            admin,
            fee_collector,
            native_token: token_address,
            creator,
            tipper,
        },
    )
}

#[test]
fn snapshot_storage_after_initialize() {
    let (env, client, ctx) = setup_initialized_env();

    let snap = snapshot_storage(&env, &client.address, &ctx);
    insta::assert_debug_snapshot!(snap);
}

#[test]
fn snapshot_storage_after_registration() {
    let (env, client, ctx) = setup_initialized_env();

    client.register_profile(
        &ctx.creator,
        &SorobanString::from_str(&env, "alice"),
        &SorobanString::from_str(&env, "Alice"),
        &SorobanString::from_str(&env, "Hello"),
        &SorobanString::from_str(&env, ""),
        &SorobanString::from_str(&env, "alice_x"),
    );

    let snap = snapshot_storage(&env, &client.address, &ctx);
    insta::assert_debug_snapshot!(snap);
}

#[test]
fn snapshot_storage_after_tip() {
    let (env, client, ctx) = setup_initialized_env();

    // Register creator
    client.register_profile(
        &ctx.creator,
        &SorobanString::from_str(&env, "alice"),
        &SorobanString::from_str(&env, "Alice"),
        &SorobanString::from_str(&env, ""),
        &SorobanString::from_str(&env, ""),
        &SorobanString::from_str(&env, "alice_x"),
    );

    // Fund tipper with XLM via SAC
    let token_address = ctx.native_token.clone();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
    // Mint requires auth from token_admin in real life; mock_all_auths covers this in tests.
    token_admin_client.mint(&ctx.tipper, &100_000_000_000);

    client.send_tip(
        &ctx.tipper,
        &ctx.creator,
        &10_000_000_i128,
        &SorobanString::from_str(&env, "Great work!"),
        &false,
        &false,
    );

    let snap = snapshot_storage(&env, &client.address, &ctx);
    insta::assert_debug_snapshot!(snap);
}

#[test]
fn snapshot_storage_after_update_credit() {
    let (env, client, ctx) = setup_initialized_env();

    client.register_profile(
        &ctx.creator,
        &SorobanString::from_str(&env, "alice"),
        &SorobanString::from_str(&env, "Alice"),
        &SorobanString::from_str(&env, ""),
        &SorobanString::from_str(&env, ""),
        &SorobanString::from_str(&env, "alice_x"),
    );

    // "update_credit" in this contract is represented by recalculating / persisting credit score.
    client.calculate_credit_score(&ctx.creator);

    let snap = snapshot_storage(&env, &client.address, &ctx);
    insta::assert_debug_snapshot!(snap);
}

