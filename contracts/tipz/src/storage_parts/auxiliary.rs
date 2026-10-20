pub fn set_verification_request(
    env: &Env,
    address: &Address,
    verification_type: &crate::types::VerificationType,
) {
    env.storage().persistent().set(
        &ExtendedDataKey::VerificationRequest(address.clone()),
        verification_type,
    );
    bump_profile_ttl(env, address);
}

pub fn remove_verification_request(env: &Env, address: &Address) {
    env.storage()
        .persistent()
        .remove(&ExtendedDataKey::VerificationRequest(address.clone()));
}

// ──────────────────────────────────────────────────────────────────────────────
// Donation page storage functions
// ──────────────────────────────────────────────────────────────────────────────

pub fn get_donation_page(env: &Env, creator: &Address) -> Option<crate::types::DonationPageConfig> {
    env.storage()
        .persistent()
        .get(&ExtendedDataKey::DonationPage(creator.clone()))
}

pub fn set_donation_page(env: &Env, creator: &Address, config: &crate::types::DonationPageConfig) {
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::DonationPage(creator.clone()), config);
    bump_profile_ttl(env, creator);
}

// ──────────────────────────────────────────────────────────────────────────────
// Stats storage functions
// ──────────────────────────────────────────────────────────────────────────────

pub fn get_stats_window_start(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::StatsWindowStart)
        .unwrap_or(0)
}

pub fn set_stats_window_start(env: &Env, timestamp: u64) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::StatsWindowStart, &timestamp);
    if let Some(mut state) = get_send_tip_state(env) {
        state.stats_window_start = timestamp;
        set_send_tip_state(env, &state);
    }
}

pub fn get_tips_last_24h(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::TipsLast24h)
        .unwrap_or(0)
}

pub fn set_tips_last_24h(env: &Env, count: u32) {
    env.storage().instance().set(&ExtendedDataKey::TipsLast24h, &count);
    if let Some(mut state) = get_send_tip_state(env) {
        state.tips_last_24h = count;
        set_send_tip_state(env, &state);
    }
}

pub fn get_volume_last_24h(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::VolumeLast24h)
        .unwrap_or(0)
}

pub fn set_volume_last_24h(env: &Env, volume: i128) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::VolumeLast24h, &volume);
    if let Some(mut state) = get_send_tip_state(env) {
        state.volume_last_24h = volume;
        set_send_tip_state(env, &state);
    }
}

pub fn get_active_creators_30d(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::ActiveCreators30d)
        .unwrap_or(0)
}

pub fn set_active_creators_30d(env: &Env, count: u32) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::ActiveCreators30d, &count);
    if let Some(mut state) = get_send_tip_state(env) {
        state.active_creators_30d = count;
        set_send_tip_state(env, &state);
    }
}

pub fn get_creator_last_active(env: &Env, creator: &Address) -> u64 {
    env.storage()
        .persistent()
        .get(&ExtendedDataKey::CreatorLastActive(creator.clone()))
        .unwrap_or(0)
}

pub fn set_creator_last_active(env: &Env, creator: &Address, timestamp: u64) {
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::CreatorLastActive(creator.clone()), &timestamp);
}

// ──────────────────────────────────────────────────────────────────────────────
// Goal storage functions
// ──────────────────────────────────────────────────────────────────────────────

pub fn get_active_goal(env: &Env, creator: &Address) -> Option<crate::types::Goal> {
    let key = ExtendedDataKey::ActiveGoal(creator.clone());
    let goal = env.storage().persistent().get(&key);
    if goal.is_some() {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    goal
}

pub fn set_active_goal(env: &Env, creator: &Address, goal: &crate::types::Goal) {
    let key = ExtendedDataKey::ActiveGoal(creator.clone());
    env.storage().persistent().set(&key, goal);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
}

pub fn get_archived_goals(env: &Env, creator: &Address) -> soroban_sdk::Vec<crate::types::Goal> {
    let key = ExtendedDataKey::ArchivedGoals(creator.clone());
    let goals = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(soroban_sdk::Vec::new(env));
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
    goals
}

pub fn set_archived_goals(
    env: &Env,
    creator: &Address,
    goals: &soroban_sdk::Vec<crate::types::Goal>,
) {
    let key = ExtendedDataKey::ArchivedGoals(creator.clone());
    env.storage().persistent().set(&key, goals);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
}

// ──────────────────────────────────────────────────────────────────────────────
// Multi-token storage functions
// ──────────────────────────────────────────────────────────────────────────────

pub fn get_accepted_token(env: &Env, token: &Address) -> Option<crate::types::AcceptedToken> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::AcceptedToken(token.clone()))
}

pub fn set_accepted_token(env: &Env, token: &Address, config: &crate::types::AcceptedToken) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::AcceptedToken(token.clone()), config);
}

pub fn get_accepted_token_list(env: &Env) -> soroban_sdk::Vec<Address> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::AcceptedTokenList)
        .unwrap_or(soroban_sdk::Vec::new(env))
}

pub fn set_accepted_token_list(env: &Env, tokens: &soroban_sdk::Vec<Address>) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::AcceptedTokenList, tokens);
}

pub fn get_token_balance(env: &Env, creator: &Address, token: &Address) -> i128 {
    let key = ExtendedDataKey::TokenBalance(creator.clone(), token.clone());
    let balance = env.storage().persistent().get(&key).unwrap_or(0);
    extend_persistent_ttl(env, &key, PersistentTier::Balance);
    balance
}

pub fn set_token_balance(env: &Env, creator: &Address, token: &Address, amount: i128) {
    let key = ExtendedDataKey::TokenBalance(creator.clone(), token.clone());
    env.storage().persistent().set(&key, &amount);
    extend_persistent_ttl(env, &key, PersistentTier::Balance);
}

pub fn add_token_balance(
    env: &Env,
    creator: &Address,
    token: &Address,
    amount: i128,
) -> Result<i128, ContractError> {
    let current = get_token_balance(env, creator, token);
    let new_balance = current
        .checked_add(amount)
        .ok_or(ContractError::OverflowError)?;
    set_token_balance(env, creator, token, new_balance);
    Ok(new_balance)
}


pub fn set_credit_computed_ledger(env: &Env, address: &Address, ledger: u32) {
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::CreditComputedAtLedger(address.clone()), &ledger);
}

/// Return the ledger sequence when the creator's credit score was last stored.
/// Returns 0 when never stored (brand-new profile).
pub fn get_credit_computed_ledger(env: &Env, address: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&ExtendedDataKey::CreditComputedAtLedger(address.clone()))
        .unwrap_or(0)
}

/// Return the configured staleness threshold in ledgers.
pub fn get_credit_staleness_threshold(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::CreditStalenessThreshold)
        .unwrap_or(crate::types::DEFAULT_CREDIT_STALENESS_THRESHOLD_LEDGERS)
}

/// Set the staleness threshold in ledgers (admin operation).
pub fn set_credit_staleness_threshold(env: &Env, threshold: u32) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::CreditStalenessThreshold, &threshold);
}

// ── Creator index helpers (#1185) ─────────────────────────────────────────────

/// Append a creator address to the dense index, used for paginated iteration.
pub fn append_creator_to_index(env: &Env, address: &Address) {
    let count: u32 = env
        .storage()
        .instance()
        .get(&ExtendedDataKey::CreatorIndexCount)
        .unwrap_or(0);
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::CreatorIndex(count), address);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::CreatorIndexCount, &(count + 1));
}

/// Return the creator address at position `index` in the dense index, or None.
pub fn get_creator_by_index(env: &Env, index: u32) -> Option<Address> {
    env.storage()
        .persistent()
        .get(&ExtendedDataKey::CreatorIndex(index))
}

/// Total number of entries in the creator dense index.
pub fn get_creator_index_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::CreatorIndexCount)
        .unwrap_or(0)
}

// ── Oracle price helpers (#1184) ──────────────────────────────────────────────

/// Store the oracle contract address for a given token.
pub fn set_token_oracle_address(env: &Env, token: &Address, oracle: &Address) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::TokenOracleAddress(token.clone()), oracle);
}

/// Return the oracle contract address for a token, if one has been configured.
pub fn get_token_oracle_address(env: &Env, token: &Address) -> Option<Address> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::TokenOracleAddress(token.clone()))
}

/// Persist a freshly-fetched oracle price for a token.
pub fn set_token_oracle_price(env: &Env, token: &Address, price: &crate::types::OraclePrice) {
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::TokenOraclePrice(token.clone()), price);
}

/// Return the last cached oracle price for a token.
pub fn get_token_oracle_price(env: &Env, token: &Address) -> Option<crate::types::OraclePrice> {
    env.storage()
        .persistent()
        .get(&ExtendedDataKey::TokenOraclePrice(token.clone()))
}

