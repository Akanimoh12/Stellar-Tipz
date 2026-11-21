pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_MIN_LEDGERS, INSTANCE_TTL_MAX_LEDGERS);
}

/// Set the TTL for a temporary tip record after storing it.
pub fn set_tip_ttl(env: &Env, key: &DataKey) {
    env.storage()
        .temporary()
        .extend_ttl(key, TIP_TTL_LEDGERS, TIP_TTL_LEDGERS);
}

/// TTL tier for a persistent entry. Balance-bearing entries get the longest
/// target so funds never archive before metadata.
pub(crate) enum PersistentTier {
    /// `Profile`, `TokenBalance` — longest TTL.
    Balance,
    /// Everything else in persistent storage.
    Standard,
}

/// The single shared persistent-TTL bump. Every persistent read and write path
/// routes through this helper, so there is exactly one place a TTL policy can
/// be forgotten — the failure mode this issue exists to remove (#1175).
///
/// No-op when the entry is absent, so it is safe to call after a read that may
/// have missed. Generic over the key type because balances live under
/// `ExtendedDataKey` while the rest live under `DataKey`.
pub(crate) fn extend_persistent_ttl<K>(env: &Env, key: &K, tier: PersistentTier)
where
    K: soroban_sdk::IntoVal<Env, soroban_sdk::Val>,
{
    if env.storage().persistent().has(key) {
        let (min, max) = match tier {
            PersistentTier::Balance => (BALANCE_TTL_MIN_LEDGERS, BALANCE_TTL_MAX_LEDGERS),
            PersistentTier::Standard => (PERSISTENT_TTL_MIN_LEDGERS, PERSISTENT_TTL_MAX_LEDGERS),
        };
        env.storage().persistent().extend_ttl(key, min, max);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Initialisation
// ──────────────────────────────────────────────────────────────────────────────

/// Returns `true` if the contract has been initialised.
pub fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Initialized)
}

/// Marks the contract as initialised.
pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&DataKey::Initialized, &true);
}

// ──────────────────────────────────────────────────────────────────────────────
// Native token
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the native XLM token contract address (SAC).
///
/// # Panics
/// Panics if the contract is not yet initialised.
pub fn get_native_token(env: &Env) -> Address {
    if let Some(config) = get_runtime_config(env) {
        return config.native_token;
    }
    env.storage()
        .instance()
        .get(&DataKey::NativeToken)
        .expect("native_token not set")
}

/// Sets the native XLM token contract address.
pub fn set_native_token(env: &Env, addr: &Address) {
    env.storage().instance().set(&DataKey::NativeToken, addr);
    update_runtime_config(env, |config| {
        config.native_token = addr.clone();
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// Pause state (granular, bitmask-based)
// ──────────────────────────────────────────────────────────────────────────────

/// Returns `true` when the specific operation is paused.
/// Checks both the specific flag and the global `PauseFlag::All`.
pub fn is_paused(env: &Env, flag: crate::types::PauseFlag) -> bool {
    if let Some(config) = get_runtime_config(env) {
        let flags = config.pause_flags;
        return crate::types::PauseFlag::is_set(flags, flag) || crate::types::PauseFlag::is_set(flags, crate::types::PauseFlag::All);
    }
    // Fallback to legacy Paused key (bool) for backwards compatibility
    let legacy_paused: bool = env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false);
    if legacy_paused {
        return true;
    }
    false
}

/// Returns `true` when the contract is globally paused (legacy compatibility).
pub fn is_globally_paused(env: &Env) -> bool {
    is_paused(env, crate::types::PauseFlag::All)
}

/// Returns the timestamp when the contract was paused, or None if not paused.
pub fn get_paused_at(env: &Env) -> Option<u64> {
    env.storage().instance().get(&ExtendedDataKey::PausedAt)
}

/// Sets the pause flags bitmask and tracks paused_at timestamp.
pub fn set_pause_flags(env: &Env, flags: u32) {
    env.storage().instance().set(&DataKey::Paused, &flags);
    update_runtime_config(env, |config| {
        config.pause_flags = flags;
    });
    if crate::types::PauseFlag::is_set(flags, crate::types::PauseFlag::All) {
        if get_paused_at(env).is_none() {
            env.storage()
                .instance()
                .set(&ExtendedDataKey::PausedAt, &env.ledger().timestamp());
        }
    } else {
        env.storage().instance().remove(&ExtendedDataKey::PausedAt);
    }
}

/// Storage migration state accessors
pub fn get_migration_state(env: &Env) -> Option<crate::types::MigrationState> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::MigrationState)
}

pub fn set_migration_state(env: &Env, state: &crate::types::MigrationState) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::MigrationState, state);
}

pub fn remove_migration_state(env: &Env) {
    env.storage()
        .instance()
        .remove(&ExtendedDataKey::MigrationState);
}

/// Sets a specific pause flag.
pub fn set_pause_flag(env: &Env, flag: crate::types::PauseFlag, enabled: bool) {
    let current = if let Some(config) = get_runtime_config(env) {
        config.pause_flags
    } else {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(0u32)
    };
    let new_flags = if enabled {
        crate::types::PauseFlag::set(current, flag)
    } else {
        crate::types::PauseFlag::clear(current, flag)
    };
    set_pause_flags(env, new_flags);
}

// ──────────────────────────────────────────────────────────────────────────────
// Minimum tip amount
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the minimum allowed tip amount in stroops.
pub fn get_min_tip_amount(env: &Env) -> i128 {
    if let Some(config) = get_runtime_config(env) {
        return config.min_tip_amount;
    }
    env.storage()
        .instance()
        .get(&DataKey::MinTipAmount)
        .unwrap_or(0_i128)
}

/// Sets the minimum allowed tip amount in stroops.
pub fn set_min_tip_amount(env: &Env, amount: i128) {
    env.storage()
        .instance()
        .set(&DataKey::MinTipAmount, &amount);
    update_runtime_config(env, |config| {
        config.min_tip_amount = amount;
    });
}

pub const DEFAULT_MIN_WITHDRAWAL_AMOUNT: i128 = 1_000_000;

pub fn get_min_withdrawal_amount(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::MinWithdrawalAmount)
        .unwrap_or(DEFAULT_MIN_WITHDRAWAL_AMOUNT)
}

pub fn set_min_withdrawal_amount(env: &Env, amount: i128) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::MinWithdrawalAmount, &amount);
}

/// Default domain re-verification interval: 30 days.
pub const DEFAULT_DOMAIN_REVERIFICATION_INTERVAL: u64 = 2_592_000;

/// Returns the configured domain re-verification interval in seconds.
pub fn get_domain_reverification_interval(env: &Env) -> u64 {
    if let Some(config) = get_runtime_config(env) {
        if config.domain_reverify_secs > 0 {
            return config.domain_reverify_secs;
        }
    }
    DEFAULT_DOMAIN_REVERIFICATION_INTERVAL
}

/// Sets the domain re-verification interval in seconds (admin only).
pub fn set_domain_reverification_interval(env: &Env, interval_secs: u64) {
    update_runtime_config(env, |config| {
        config.domain_reverify_secs = interval_secs;
    });
}

/// Returns the effective minimum tip for a creator (custom override or global default).
pub fn get_effective_creator_min_tip(env: &Env, creator: &Address) -> i128 {
    if let Some(profile) = get_profile_opt(env, creator) {
        if let Some(custom) = profile.custom_min_tip {
            return custom;
        }
    }
    get_min_tip_amount(env)
}

/// Returns a creator's custom minimum tip override from their profile, if set.
pub fn get_creator_min_tip_override(env: &Env, creator: &Address) -> Option<i128> {
    get_profile_opt(env, creator).and_then(|p| p.custom_min_tip)
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the current admin address.
///
/// # Panics
/// Panics if the contract is not yet initialised.
#[allow(dead_code)]
pub fn get_admin(env: &Env) -> Address {
    if let Some(config) = get_runtime_config(env) {
        return config.admin;
    }
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("admin not set")
}

/// Overwrites the admin address.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
    update_runtime_config(env, |config| {
        config.admin = admin.clone();
    });
}

/// Pending admin change proposal, if any.
pub fn get_pending_admin_change(env: &Env) -> Option<crate::types::AdminChangeProposal> {
    env.storage().instance().get(&ExtendedDataKey::PendingAdminChange)
}

pub fn set_pending_admin_change(env: &Env, proposal: &crate::types::AdminChangeProposal) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::PendingAdminChange, proposal);
}

pub fn remove_pending_admin_change(env: &Env) {
    env.storage()
        .instance()
        .remove(&ExtendedDataKey::PendingAdminChange);
}

// ──────────────────────────────────────────────────────────────────────────────
// Profile deactivation (separate from `Profile` blob for upgrade-safe reads)
// ──────────────────────────────────────────────────────────────────────────────

/// `true` when the creator profile is temporarily deactivated.
pub fn is_profile_deactivated(env: &Env, address: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&ExtendedDataKey::ProfileDeactivatedAt(address.clone()))
}

/// Ledger timestamp when the profile was deactivated, if deactivated.
pub fn get_profile_deactivated_at(env: &Env, address: &Address) -> Option<u64> {
    env.storage()
        .persistent()
        .get(&ExtendedDataKey::ProfileDeactivatedAt(address.clone()))
}

pub fn set_profile_deactivated_at(env: &Env, address: &Address, at: u64) {
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::ProfileDeactivatedAt(address.clone()), &at);
}

pub fn clear_profile_deactivation(env: &Env, address: &Address) {
    let key = ExtendedDataKey::ProfileDeactivatedAt(address.clone());
    if env.storage().persistent().has(&key) {
        env.storage().persistent().remove(&key);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Creator tip allowlist/blocklist
// ──────────────────────────────────────────────────────────────────────────────

pub fn is_creator_blocked_tipper(env: &Env, creator: &Address, tipper: &Address) -> bool {
    let key = ExtendedDataKey::CreatorBlockedTipper(creator.clone(), tipper.clone());
    let blocked = env.storage().persistent().has(&key);
    if blocked {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    blocked
}

pub fn get_creator_blocked_tipper_count(env: &Env, creator: &Address) -> u32 {
    let key = ExtendedDataKey::CreatorBlockedTipperCount(creator.clone());
    let count = env.storage().persistent().get(&key).unwrap_or(0_u32);
    if count > 0 {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    count
}

pub fn set_creator_blocked_tipper(env: &Env, creator: &Address, tipper: &Address, blocked_at: u64) {
    let entry_key = ExtendedDataKey::CreatorBlockedTipper(creator.clone(), tipper.clone());
    if !env.storage().persistent().has(&entry_key) {
        let count_key = ExtendedDataKey::CreatorBlockedTipperCount(creator.clone());
        let count = get_creator_blocked_tipper_count(env, creator);
        env.storage().persistent().set(&count_key, &(count + 1));
        extend_persistent_ttl(env, &count_key, PersistentTier::Standard);
    }
    env.storage().persistent().set(&entry_key, &blocked_at);
    extend_persistent_ttl(env, &entry_key, PersistentTier::Standard);
}

pub fn remove_creator_blocked_tipper(env: &Env, creator: &Address, tipper: &Address) {
    let entry_key = ExtendedDataKey::CreatorBlockedTipper(creator.clone(), tipper.clone());
    if env.storage().persistent().has(&entry_key) {
        env.storage().persistent().remove(&entry_key);
        let count_key = ExtendedDataKey::CreatorBlockedTipperCount(creator.clone());
        let count = get_creator_blocked_tipper_count(env, creator);
        env.storage()
            .persistent()
            .set(&count_key, &count.saturating_sub(1));
        extend_persistent_ttl(env, &count_key, PersistentTier::Standard);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin change history & Audit log
// ──────────────────────────────────────────────────────────────────────────────

/// Maximum capacity of the ring-buffered admin audit log.
pub const ADMIN_AUDIT_LOG_CAPACITY: u32 = 100;

pub fn load_admin_audit_log(env: &Env) -> soroban_sdk::Vec<crate::types::AdminAuditEntry> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::AdminAuditLog)
        .unwrap_or_else(|| soroban_sdk::Vec::new(env))
}

pub fn get_admin_audit_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::AdminAuditCount)
        .unwrap_or(0)
}

/// Append an admin audit entry to the ring-buffered log.
/// Wraps around by dropping the oldest entry when capacity is reached.
pub fn append_admin_audit_entry(
    env: &Env,
    actor: &Address,
    action_kind: Symbol,
    before_value: &String,
    after_value: &String,
) -> crate::types::AdminAuditEntry {
    let count = get_admin_audit_count(env);
    let next_id = count.saturating_add(1);

    let entry = crate::types::AdminAuditEntry {
        id: next_id,
        actor: actor.clone(),
        action_kind,
        before_value: before_value.clone(),
        after_value: after_value.clone(),
        ledger_sequence: env.ledger().sequence(),
        timestamp: env.ledger().timestamp(),
    };

    let mut log = load_admin_audit_log(env);
    if log.len() >= ADMIN_AUDIT_LOG_CAPACITY {
        log.pop_front();
    }
    log.push_back(entry.clone());

    env.storage()
        .instance()
        .set(&ExtendedDataKey::AdminAuditLog, &log);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::AdminAuditCount, &next_id);

    entry
}

fn load_admin_change_history(env: &Env) -> soroban_sdk::Vec<crate::types::AdminChangeHistoryEntry> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::AdminChangeHistory)
        .unwrap_or(soroban_sdk::Vec::new(env))
}

pub fn get_admin_change_history_next_id(env: &Env) -> u32 {
    load_admin_change_history(env).len()
}

/// Append a completed admin change to history (sequential ids, newest has highest id).
/// Enforces maximum history entries limit.
pub fn append_admin_change_history(env: &Env, entry: &crate::types::AdminChangeHistoryEntry) {
    let mut history = load_admin_change_history(env);
    if history.len() >= ADMIN_AUDIT_LOG_CAPACITY {
        history.pop_front();
    }
    history.push_back(entry.clone());
    env.storage()
        .instance()
        .set(&ExtendedDataKey::AdminChangeHistory, &history);
}

pub fn get_admin_change_history_entry(
    env: &Env,
    id: u32,
) -> Option<crate::types::AdminChangeHistoryEntry> {
    load_admin_change_history(env).get(id)
}

// ──────────────────────────────────────────────────────────────────────────────
// Contract version
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the stored contract version, or 0 if not yet initialized.
pub fn get_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::ContractVersion)
        .unwrap_or(0)
}

/// Sets the stored contract version.
pub fn set_version(env: &Env, version: u32) {
    env.storage()
        .instance()
        .set(&DataKey::ContractVersion, &version);
}

// ──────────────────────────────────────────────────────────────────────────────
// Fee basis points
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the withdrawal fee in basis points (100 bps = 1 %).
pub fn get_fee_bps(env: &Env) -> u32 {
    if let Some(config) = get_runtime_config(env) {
        return config.fee_bps;
    }
    env.storage()
        .instance()
        .get(&DataKey::FeePercent)
        .unwrap_or(0)
}

/// Sets the withdrawal fee in basis points.
pub fn set_fee_bps(env: &Env, fee_bps: u32) {
    env.storage().instance().set(&DataKey::FeePercent, &fee_bps);
    update_runtime_config(env, |config| {
        config.fee_bps = fee_bps;
    });
}

/// Returns the configured minimum fee-change delay in ledgers.
pub fn get_fee_change_delay_ledgers(env: &Env) -> u32 {
    if let Some(config) = get_runtime_config(env) {
        return config.fee_change_delay_ledgers;
    }
    env.storage()
        .instance()
        .get(&symbol_short!("fee_delay"))
        .unwrap_or(crate::admin::DEFAULT_FEE_CHANGE_DELAY_LEDGERS)
}

/// Sets the configured minimum fee-change delay in ledgers.
pub fn set_fee_change_delay_ledgers(env: &Env, delay_ledgers: u32) {
    env.storage()
        .instance()
        .set(&symbol_short!("fee_delay"), &delay_ledgers);
    update_runtime_config(env, |config| {
        config.fee_change_delay_ledgers = delay_ledgers;
    });
}

/// Returns the pending fee change, if any.
pub fn get_pending_fee_change(env: &Env) -> Option<(u32, u32, u32, bool)> {
    env.storage().instance().get(&symbol_short!("fee_pend"))
}

/// Stores the pending fee change.
pub fn set_pending_fee_change(env: &Env, pending: &(u32, u32, u32, bool)) {
    env.storage()
        .instance()
        .set(&symbol_short!("fee_pend"), pending);
}

/// Clears the pending fee change.
pub fn clear_pending_fee_change(env: &Env) {
    env.storage().instance().remove(&symbol_short!("fee_pend"));
}

/// Returns the maximum active subscriptions per subscriber (default 50).
pub fn get_subscription_limit(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::SubscriptionLimit)
        .unwrap_or(50)
}

/// Sets the maximum active subscriptions per subscriber.
pub fn set_subscription_limit(env: &Env, limit: u32) {
    env.storage()
        .instance()
        .set(&DataKey::SubscriptionLimit, &limit);
}

pub const MAX_CIRCUIT_BREAKER_BUCKETS: u32 = 24;
pub const DEFAULT_CIRCUIT_BREAKER_BUCKETS: u32 = 12;
pub const DEFAULT_CIRCUIT_BREAKER_WINDOW_SECS: u64 = 3600;

pub fn default_circuit_breaker_config() -> CircuitBreakerConfig {
    CircuitBreakerConfig {
        enabled: false,
        threshold: 0,
        window_secs: DEFAULT_CIRCUIT_BREAKER_WINDOW_SECS,
        bucket_count: DEFAULT_CIRCUIT_BREAKER_BUCKETS,
    }
}

pub fn get_circuit_breaker_config(env: &Env) -> CircuitBreakerConfig {
    env.storage()
        .instance()
        .get(&DataKey::CircuitBreakerConfig)
        .unwrap_or_else(default_circuit_breaker_config)
}

pub fn set_circuit_breaker_config(env: &Env, config: &CircuitBreakerConfig) {
    env.storage()
        .instance()
        .set(&DataKey::CircuitBreakerConfig, config);
}

pub fn get_circuit_breaker_status(env: &Env) -> CircuitBreakerStatus {
    env.storage()
        .instance()
        .get(&DataKey::CircuitBreakerStatus)
        .unwrap_or_else(|| empty_circuit_breaker_status(env, DEFAULT_CIRCUIT_BREAKER_BUCKETS))
}

pub fn set_circuit_breaker_status(env: &Env, status: &CircuitBreakerStatus) {
    env.storage()
        .instance()
        .set(&DataKey::CircuitBreakerStatus, status);
}

pub fn reset_circuit_breaker_status(env: &Env, bucket_count: u32) {
    let count = bucket_count.clamp(1, MAX_CIRCUIT_BREAKER_BUCKETS);
    set_circuit_breaker_status(env, &empty_circuit_breaker_status(env, count));
}

fn empty_circuit_breaker_status(env: &Env, bucket_count: u32) -> CircuitBreakerStatus {
    let count = bucket_count.clamp(1, MAX_CIRCUIT_BREAKER_BUCKETS);
    let mut bucket_starts = soroban_sdk::Vec::new(env);
    let mut bucket_volumes = soroban_sdk::Vec::new(env);
    for _ in 0..count {
        bucket_starts.push_back(0);
        bucket_volumes.push_back(0);
    }
    CircuitBreakerStatus {
        bucket_starts,
        bucket_volumes,
        tripped: false,
        tripped_at: None,
    }
}

/// Returns `true` if the reentrancy guard is currently active (a fund-moving
/// operation is in progress). Callers should not make external token transfers
/// while the guard is active.
pub fn is_reentrancy_guard_active(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::ReentrancyGuard)
        .unwrap_or(false)
}

/// Set the reentrancy guard to `locked` (beginning a fund-moving operation)
/// or `unlocked` (ending it).
pub fn set_reentrancy_guard(env: &Env, locked: bool) {
    env.storage()
        .instance()
        .set(&DataKey::ReentrancyGuard, &locked);
}

/// Guard helper: sets the guard to `locked`, runs `f`, then resets it to
/// `unlocked` regardless of whether `f` returns `Ok` or `Err`.
///
/// # Safety
/// Callers must ensure that `f` does not attempt any further cross-contract
/// calls that would be blocked by this guard (e.g. token transfers), as the
/// guard is purely a defense-in-depth measure.
pub fn with_reentrancy_guard_unlocked<'a, F, R>(env: &Env, f: F) -> R
where
    F: FnOnce() -> R,
{
    set_reentrancy_guard(env, true);
    let result = f();
    set_reentrancy_guard(env, false);
    result
}

// ──────────────────────────────────────────────────────────────────────────────
// Fee collector
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the address that receives collected fees.
///
/// # Panics
/// Panics if the contract is not yet initialised.
#[allow(dead_code)]
pub fn get_fee_collector(env: &Env) -> Address {
    if let Some(config) = get_runtime_config(env) {
        return config.fee_collector;
    }
    env.storage()
        .instance()
        .get(&DataKey::FeeCollector)
        .expect("fee_collector not set")
}

/// Sets the fee collector address.
pub fn set_fee_collector(env: &Env, addr: &Address) {
    env.storage().instance().set(&DataKey::FeeCollector, addr);
    update_runtime_config(env, |config| {
        config.fee_collector = addr.clone();
    });
}

pub fn get_runtime_config(env: &Env) -> Option<RuntimeConfig> {
    env.storage().instance().get(&CacheKey::RuntimeConfig)
}

pub fn set_runtime_config(env: &Env, config: &RuntimeConfig) {
    env.storage()
        .instance()
        .set(&CacheKey::RuntimeConfig, config);
}

pub fn update_runtime_config<F>(env: &Env, update: F)
where
    F: FnOnce(&mut RuntimeConfig),
{
    if let Some(mut config) = get_runtime_config(env) {
        update(&mut config);
        set_runtime_config(env, &config);
    }
}

// ──────────────────────────────────────────────────────────────────────────────

