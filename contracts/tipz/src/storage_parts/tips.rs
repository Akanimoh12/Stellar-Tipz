// ──────────────────────────────────────────────────────────────────────────────
// Tip counter
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the current global tip count (also the index of the *next* tip).
pub fn get_tip_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TipCount)
        .unwrap_or(0)
}

/// Returns the current scheduled-tip count (next scheduled tip ID).
pub fn get_scheduled_tip_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::ScheduledTipCount)
        .unwrap_or(0)
}

/// Atomically reads the current scheduled-tip count, increments it in storage,
/// and returns the **pre-increment** value for the next scheduled tip.
pub fn increment_scheduled_tip_count(env: &Env) -> u32 {
    let count = get_scheduled_tip_count(env);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::ScheduledTipCount, &(count + 1));
    count
}

/// Returns the stored scheduled tip for a given ID, if any.
pub fn get_scheduled_tip(env: &Env, scheduled_tip_id: u32) -> Option<crate::types::ScheduledTip> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::ScheduledTip(scheduled_tip_id))
}

/// Stores a scheduled tip by ID.
pub fn set_scheduled_tip(env: &Env, scheduled_tip_id: u32, scheduled_tip: &crate::types::ScheduledTip) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::ScheduledTip(scheduled_tip_id), scheduled_tip);
}

/// Appends a scheduled tip ID to the sender's list and bumps the count.
pub fn add_sender_scheduled_tip(env: &Env, sender: &Address, scheduled_tip_id: u32) {
    let current = env
        .storage()
        .instance()
        .get(&ExtendedDataKey::SenderScheduledTipCount(sender.clone()))
        .unwrap_or(0);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::SenderScheduledTip(sender.clone(), current), &scheduled_tip_id);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::SenderScheduledTipCount(sender.clone()), &(current + 1));
}

/// Appends a scheduled tip ID to the creator's list and bumps the count.
pub fn add_creator_scheduled_tip(env: &Env, creator: &Address, scheduled_tip_id: u32) {
    let current = env
        .storage()
        .instance()
        .get(&ExtendedDataKey::CreatorScheduledTipCount(creator.clone()))
        .unwrap_or(0);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::CreatorScheduledTip(creator.clone(), current), &scheduled_tip_id);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::CreatorScheduledTipCount(creator.clone()), &(current + 1));
}

/// Returns all scheduled tip IDs for a sender.
pub fn get_sender_scheduled_tip_ids(env: &Env, sender: &Address) -> soroban_sdk::Vec<u32> {
    let count = env
        .storage()
        .instance()
        .get(&ExtendedDataKey::SenderScheduledTipCount(sender.clone()))
        .unwrap_or(0);
    let mut ids = soroban_sdk::Vec::new(env);
    for i in 0..count {
        if let Some(id) = env
            .storage()
            .instance()
            .get(&ExtendedDataKey::SenderScheduledTip(sender.clone(), i))
        {
            ids.push_back(id);
        }
    }
    ids
}

/// Returns all scheduled tip IDs for a creator.
pub fn get_creator_scheduled_tip_ids(env: &Env, creator: &Address) -> soroban_sdk::Vec<u32> {
    let count = env
        .storage()
        .instance()
        .get(&ExtendedDataKey::CreatorScheduledTipCount(creator.clone()))
        .unwrap_or(0);
    let mut ids = soroban_sdk::Vec::new(env);
    for i in 0..count {
        if let Some(id) = env
            .storage()
            .instance()
            .get(&ExtendedDataKey::CreatorScheduledTip(creator.clone(), i))
        {
            ids.push_back(id);
        }
    }
    ids
}

/// Atomically reads the current tip count, increments it in storage, and
/// returns the **pre-increment** value (the index to assign to the new tip).
pub fn increment_tip_count(env: &Env) -> u32 {
    let count = get_tip_count(env);
    env.storage()
        .instance()
        .set(&DataKey::TipCount, &(count + 1));
    if let Some(mut state) = get_send_tip_state(env) {
        state.tip_count = count + 1;
        set_send_tip_state(env, &state);
    }
    count
}

pub fn get_send_tip_state(env: &Env) -> Option<SendTipState> {
    env.storage().instance().get(&CacheKey::SendTipState)
}

pub fn set_send_tip_state(env: &Env, state: &SendTipState) {
    env.storage().instance().set(&CacheKey::SendTipState, state);
}

pub fn get_or_build_send_tip_state(env: &Env) -> SendTipState {
    get_send_tip_state(env).unwrap_or(SendTipState {
        tip_count: get_tip_count(env),
        total_tips_volume: get_total_tips_volume(env),
        stats_window_start: get_stats_window_start(env),
        tips_last_24h: get_tips_last_24h(env),
        volume_last_24h: get_volume_last_24h(env),
        active_creators_30d: get_active_creators_30d(env),
    })
}

pub fn apply_send_tip_state(env: &Env, state: &SendTipState) {
    set_send_tip_state(env, state);
    env.storage()
        .instance()
        .set(&DataKey::TipCount, &state.tip_count);
    env.storage()
        .instance()
        .set(&DataKey::TotalTipsVolume, &state.total_tips_volume);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::StatsWindowStart, &state.stats_window_start);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::TipsLast24h, &state.tips_last_24h);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::VolumeLast24h, &state.volume_last_24h);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::ActiveCreators30d, &state.active_creators_30d);
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-tipper reverse index
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the number of tips sent by `tipper`.
pub fn get_tipper_tip_count(env: &Env, tipper: &Address) -> u32 {
    env.storage()
        .temporary()
        .get(&DataKey::TipperTipCount(tipper.clone()))
        .unwrap_or(0)
}

/// Records a new tip ID for `tipper` and bumps the per-tipper count.
/// The reverse-index entry shares the same TTL as tip records.
pub fn add_tipper_tip(env: &Env, tipper: &Address, tip_id: u32) {
    let local_index = get_tipper_tip_count(env, tipper);

    let idx_key = DataKey::TipperTip(tipper.clone(), local_index);
    env.storage().temporary().set(&idx_key, &tip_id);
    set_tip_ttl(env, &idx_key);

    let count_key = DataKey::TipperTipCount(tipper.clone());
    env.storage()
        .temporary()
        .set(&count_key, &(local_index + 1));
    set_tip_ttl(env, &count_key);
}

/// Returns the number of subscriptions for a subscriber.
pub fn get_subscriber_sub_count(env: &Env, subscriber: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::SubscriberSubCount(subscriber.clone()))
        .unwrap_or(0)
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-creator reverse index
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the number of tips received by `creator` (within the TTL window).
pub fn get_creator_tip_count(env: &Env, creator: &Address) -> u32 {
    env.storage()
        .temporary()
        .get(&DataKey::CreatorTipCount(creator.clone()))
        .unwrap_or(0)
}

/// Records a new tip ID for `creator` and bumps the per-creator count.
/// The reverse-index entry shares the same TTL as tip records.
pub fn add_creator_tip(env: &Env, creator: &Address, tip_id: u32) {
    let local_index = get_creator_tip_count(env, creator);

    let idx_key = DataKey::CreatorTip(creator.clone(), local_index);
    env.storage().temporary().set(&idx_key, &tip_id);
    set_tip_ttl(env, &idx_key);

    let count_key = DataKey::CreatorTipCount(creator.clone());
    env.storage()
        .temporary()
        .set(&count_key, &(local_index + 1));
    set_tip_ttl(env, &count_key);
}

/// Remove all per-creator tip index entries from temporary storage.
///
/// Called during `deregister_profile` to prevent stale `CreatorTipCount` from
/// causing index collisions when the same address re-registers later.
pub fn reset_creator_tip_index(env: &Env, creator: &Address) {
    let count = get_creator_tip_count(env, creator);
    let mut i: u32 = 0;
    while i < count {
        let key = DataKey::CreatorTip(creator.clone(), i);
        if env.storage().temporary().has(&key) {
            env.storage().temporary().remove(&key);
        }
        i += 1;
    }
    let count_key = DataKey::CreatorTipCount(creator.clone());
    if env.storage().temporary().has(&count_key) {
        env.storage().temporary().remove(&count_key);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Streak tracking
// ──────────────────────────────────────────────────────────────────────────────

/// Return the streak record for a supporter/creator pair, if any.
pub fn get_streak(
    env: &Env,
    supporter: &Address,
    creator: &Address,
) -> Option<crate::types::Streak> {
    env.storage()
        .persistent()
        .get(&ExtendedDataKey::Streak(supporter.clone(), creator.clone()))
}

/// Persist a streak record for a supporter/creator pair.
pub fn set_streak(env: &Env, streak: &crate::types::Streak) {
    env.storage().persistent().set(
        &ExtendedDataKey::Streak(streak.supporter.clone(), streak.creator.clone()),
        streak,
    );
}

/// Return the total streak bonus accumulated for a creator.
///
/// Streak-bonus storage is intentionally disabled. Persisting it requires either
/// a new `DataKey` variant (increases contract footprint) or embedding a
/// `streak_bonus` field in `Profile` (requires a storage-schema migration). Both
/// options are deferred to the next planned contract upgrade. The three helpers
/// are kept as zero-cost stubs so existing call sites compile without change.
/// See PR #745 for the full deferral rationale.
pub fn get_creator_streak_bonus(_env: &Env, _creator: &Address) -> u32 {
    0
}

/// Add streak bonus points to a creator.
///
/// No-op until `streak_bonus` is introduced to `Profile` during a planned
/// storage-schema migration. See [`get_creator_streak_bonus`] for details.
pub fn add_creator_streak_bonus(_env: &Env, _creator: &Address, _bonus: u32) {}

/// Adjust a creator's streak bonus by a signed delta.
///
/// No-op until `streak_bonus` is introduced to `Profile` during a planned
/// storage-schema migration. See [`get_creator_streak_bonus`] for details.
pub fn adjust_creator_streak_bonus(_env: &Env, _creator: &Address, _delta: i32) {}

/// Remove all per-tipper tip index entries from temporary storage.
///
/// Called during `deregister_profile` to prevent stale `TipperTipCount` from
/// causing index collisions when the same address re-registers later.
pub fn reset_tipper_tip_index(env: &Env, tipper: &Address) {
    let count = get_tipper_tip_count(env, tipper);
    let mut i: u32 = 0;
    while i < count {
        let key = DataKey::TipperTip(tipper.clone(), i);
        if env.storage().temporary().has(&key) {
            env.storage().temporary().remove(&key);
        }
        i += 1;
    }
    let count_key = DataKey::TipperTipCount(tipper.clone());
    if env.storage().temporary().has(&count_key) {
        env.storage().temporary().remove(&count_key);
    }
}


