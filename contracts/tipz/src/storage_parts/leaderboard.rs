// ──────────────────────────────────────────────────────────────────────────────
// Leaderboard (Multi-period)
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the leaderboard for a specific period.
pub fn get_leaderboard(env: &Env, period: LeaderboardPeriod) -> soroban_sdk::Vec<LeaderboardEntry> {
    if let Some(boards) = get_leaderboard_set(env) {
        return match period {
            LeaderboardPeriod::AllTime => boards.all_time,
            LeaderboardPeriod::Monthly => boards.monthly,
            LeaderboardPeriod::Weekly => boards.weekly,
        };
    }
    env.storage()
        .instance()
        .get(&DataKey::Leaderboard(period))
        .unwrap_or(soroban_sdk::Vec::new(env))
}

/// Sets the leaderboard for a specific period.
pub fn set_leaderboard(
    env: &Env,
    period: LeaderboardPeriod,
    leaderboard: &soroban_sdk::Vec<LeaderboardEntry>,
) {
    env.storage()
        .instance()
        .set(&DataKey::Leaderboard(period), leaderboard);
    let mut boards = get_leaderboard_set(env).unwrap_or_else(|| LeaderboardSet {
        all_time: get_legacy_leaderboard(env, LeaderboardPeriod::AllTime),
        monthly: get_legacy_leaderboard(env, LeaderboardPeriod::Monthly),
        weekly: get_legacy_leaderboard(env, LeaderboardPeriod::Weekly),
        monthly_reset_at: get_last_leaderboard_reset(env, LeaderboardPeriod::Monthly),
        weekly_reset_at: get_last_leaderboard_reset(env, LeaderboardPeriod::Weekly),
    });
    match period {
        LeaderboardPeriod::AllTime => boards.all_time = leaderboard.clone(),
        LeaderboardPeriod::Monthly => boards.monthly = leaderboard.clone(),
        LeaderboardPeriod::Weekly => boards.weekly = leaderboard.clone(),
    }
    set_leaderboard_set(env, &boards);
}

fn get_legacy_leaderboard(
    env: &Env,
    period: LeaderboardPeriod,
) -> soroban_sdk::Vec<LeaderboardEntry> {
    env.storage()
        .instance()
        .get(&DataKey::Leaderboard(period))
        .unwrap_or(soroban_sdk::Vec::new(env))
}

pub fn get_leaderboard_set(env: &Env) -> Option<LeaderboardSet> {
    env.storage().instance().get(&CacheKey::LeaderboardSet)
}

pub fn set_leaderboard_set(env: &Env, boards: &LeaderboardSet) {
    env.storage()
        .instance()
        .set(&CacheKey::LeaderboardSet, boards);
    env.storage().instance().set(
        &DataKey::Leaderboard(LeaderboardPeriod::AllTime),
        &boards.all_time,
    );
    env.storage().instance().set(
        &DataKey::Leaderboard(LeaderboardPeriod::Monthly),
        &boards.monthly,
    );
    env.storage().instance().set(
        &DataKey::Leaderboard(LeaderboardPeriod::Weekly),
        &boards.weekly,
    );
    env.storage().instance().set(
        &DataKey::LastLeaderboardReset(LeaderboardPeriod::Monthly),
        &boards.monthly_reset_at,
    );
    env.storage().instance().set(
        &DataKey::LastLeaderboardReset(LeaderboardPeriod::Weekly),
        &boards.weekly_reset_at,
    );
}

/// Returns the timestamp of the last reset for a specific period.
pub fn get_last_leaderboard_reset(env: &Env, period: LeaderboardPeriod) -> u64 {
    if let Some(boards) = get_leaderboard_set(env) {
        return match period {
            LeaderboardPeriod::AllTime => 0,
            LeaderboardPeriod::Monthly => boards.monthly_reset_at,
            LeaderboardPeriod::Weekly => boards.weekly_reset_at,
        };
    }
    env.storage()
        .instance()
        .get(&DataKey::LastLeaderboardReset(period))
        .unwrap_or(0)
}

/// Sets the timestamp of the last reset for a specific period.
pub fn set_last_leaderboard_reset(env: &Env, period: LeaderboardPeriod, at: u64) {
    env.storage()
        .instance()
        .set(&DataKey::LastLeaderboardReset(period), &at);
    if let Some(mut boards) = get_leaderboard_set(env) {
        match period {
            LeaderboardPeriod::AllTime => {}
            LeaderboardPeriod::Monthly => boards.monthly_reset_at = at,
            LeaderboardPeriod::Weekly => boards.weekly_reset_at = at,
        }
        set_leaderboard_set(env, &boards);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Rate Limiting
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the current rate limit configuration.
pub fn get_rate_limit_config(env: &Env) -> RateLimitConfig {
    if let Some(config) = get_runtime_config(env) {
        return config.rate_limit;
    }
    env.storage()
        .instance()
        .get(&ExtendedDataKey::RateLimitConfig)
        .unwrap_or(RateLimitConfig {
            max_ops: 50,
            window_secs: 3600, // 1 hour default
        })
}

/// Sets the rate limit configuration.
pub fn set_rate_limit_config(env: &Env, config: &RateLimitConfig) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::RateLimitConfig, config);
    update_runtime_config(env, |runtime_config| {
        runtime_config.rate_limit = config.clone();
    });
}

pub fn bump_existing_profile_ttl(env: &Env, address: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::Profile(address.clone()),
        PROFILE_TTL_MIN_LEDGERS,
        PROFILE_TTL_MAX_LEDGERS,
    );
}

/// Returns the current rate limit status for an address.
pub fn get_rate_limit_status(env: &Env, address: &Address) -> Option<RateLimitStatus> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::RateLimit(address.clone()))
}

/// Sets the rate limit status for an address.
pub fn set_rate_limit_status(env: &Env, address: &Address, status: &RateLimitStatus) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::RateLimit(address.clone()), status);
}

// ──────────────────────────────────────────────────────────────────────────────
// Period Volume Tracking
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the tip volume received by a creator during a specific period.
pub fn get_creator_period_volume(env: &Env, creator: &Address, period: LeaderboardPeriod) -> i128 {
    let start_at = get_last_leaderboard_reset(env, period);
    env.storage()
        .instance()
        .get(&ExtendedDataKey::CreatorPeriodVolume(
            creator.clone(),
            period,
            start_at,
        ))
        .unwrap_or(0)
}

/// Adds `amount` to a creator's tip volume for a specific period.
pub fn add_creator_period_volume(
    env: &Env,
    creator: &Address,
    period: LeaderboardPeriod,
    amount: i128,
) -> i128 {
    let start_at = get_last_leaderboard_reset(env, period);
    let current = get_creator_period_volume(env, creator, period);
    let next = current.saturating_add(amount);
    env.storage().instance().set(
        &ExtendedDataKey::CreatorPeriodVolume(creator.clone(), period, start_at),
        &next,
    );
    next
}

pub fn get_creator_period_volumes(env: &Env, creator: &Address) -> Option<CreatorPeriodVolumes> {
    env.storage()
        .instance()
        .get(&CacheKey::CreatorPeriodVolumes(creator.clone()))
}

pub fn set_creator_period_volumes(env: &Env, creator: &Address, volumes: &CreatorPeriodVolumes) {
    env.storage()
        .instance()
        .set(&CacheKey::CreatorPeriodVolumes(creator.clone()), volumes);
    env.storage().instance().set(
        &ExtendedDataKey::CreatorPeriodVolume(
            creator.clone(),
            LeaderboardPeriod::Monthly,
            volumes.monthly_start_at,
        ),
        &volumes.monthly,
    );
    env.storage().instance().set(
        &ExtendedDataKey::CreatorPeriodVolume(
            creator.clone(),
            LeaderboardPeriod::Weekly,
            volumes.weekly_start_at,
        ),
        &volumes.weekly,
    );
}

pub fn add_creator_period_volumes(
    env: &Env,
    creator: &Address,
    monthly_start_at: u64,
    weekly_start_at: u64,
    amount: i128,
) -> (i128, i128) {
    let mut volumes = get_creator_period_volumes(env, creator).unwrap_or(CreatorPeriodVolumes {
        monthly_start_at,
        monthly: 0,
        weekly_start_at,
        weekly: 0,
    });

    if volumes.monthly_start_at != monthly_start_at {
        volumes.monthly_start_at = monthly_start_at;
        volumes.monthly = 0;
    }
    if volumes.weekly_start_at != weekly_start_at {
        volumes.weekly_start_at = weekly_start_at;
        volumes.weekly = 0;
    }

    volumes.monthly = volumes.monthly.saturating_add(amount);
    volumes.weekly = volumes.weekly.saturating_add(amount);

    let monthly = volumes.monthly;
    let weekly = volumes.weekly;
    set_creator_period_volumes(env, creator, &volumes);
    (monthly, weekly)
}

/// Resets a creator's period volume (e.g. after a leaderboard reset).
/// Note: With timestamp-based keys, we don't strictly need this, but it can be used for cleanup.
pub fn reset_creator_period_volume(env: &Env, creator: &Address, period: LeaderboardPeriod) {
    let start_at = get_last_leaderboard_reset(env, period);
    env.storage()
        .instance()
        .remove(&ExtendedDataKey::CreatorPeriodVolume(
            creator.clone(),
            period,
            start_at,
        ));
}

// ──────────────────────────────────────────────────────────────────────────────
// Sender-Creator Volume Tracking (for leaderboard concentration cap)
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the cumulative tip volume from a specific sender to a specific creator.
pub fn get_sender_creator_volume(env: &Env, sender: &Address, creator: &Address) -> i128 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::SenderCreatorVolume(sender.clone(), creator.clone()))
        .unwrap_or(0)
}

/// Adds `amount` to the cumulative tip volume from sender to creator.
pub fn add_sender_creator_volume(env: &Env, sender: &Address, creator: &Address, amount: i128) -> i128 {
    let current = get_sender_creator_volume(env, sender, creator);
    let next = current.saturating_add(amount);
    env.storage().instance().set(
        &ExtendedDataKey::SenderCreatorVolume(sender.clone(), creator.clone()),
        &next,
    );
    next
}

/// Resets the sender-creator volume (e.g., for testing or admin cleanup).
pub fn reset_sender_creator_volume(env: &Env, sender: &Address, creator: &Address) {
    env.storage()
        .instance()
        .remove(&ExtendedDataKey::SenderCreatorVolume(sender.clone(), creator.clone()));
}


