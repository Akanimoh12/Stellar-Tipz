/// Create a new [`Tip`] record and store it in temporary storage.
pub fn store_tip(
    env: &Env,
    sender: &Address,
    benefactor: Option<Address>,
    creator: &Address,
    amount: i128,
    message: String,
    is_anonymous: bool,
    is_encrypted: bool,
) -> u32 {
    let tip_id = storage::increment_tip_count(env);
    store_tip_with_id(
        env,
        tip_id,
        sender,
        benefactor,
        creator,
        amount,
        message,
        is_anonymous,
        is_encrypted,
    );
    tip_id
}

fn store_tip_with_id(
    env: &Env,
    tip_id: u32,
    sender: &Address,
    benefactor: Option<Address>,
    creator: &Address,
    amount: i128,
    message: String,
    is_anonymous: bool,
    is_encrypted: bool,
) {
    let key = DataKey::Tip(tip_id);

    // Generate pseudonym for anonymous tips: sha256(sender || creator || contract_salt)
    let pseudonym = if is_anonymous {
        let contract_salt = env.current_contract_address();
        // Convert addresses to their canonical string bytes and concatenate
        // with a separator to keep the input unambiguous.
        let mut data = soroban_sdk::Bytes::new(env);
        for addr in [sender, creator, &contract_salt] {
            let addr_str = addr.to_string();
            let len = addr_str.len() as usize;
            let mut buf = [0u8; 80]; // Max address string length is 64.
            addr_str.copy_into_slice(&mut buf[..len]);
            data.extend_from_slice(&buf[..len]);
            data.extend_from_slice(b"|");
        }

        let hash = env.crypto().sha256(&data);
        Some(soroban_sdk::Bytes::from(hash))
    } else {
        None
    };

    let tip = Tip {
        id: tip_id,
        sender: sender.clone(),
        benefactor: if is_anonymous {
            None
        } else {
            benefactor.or(Some(sender.clone()))
        },
        creator: creator.clone(),
        amount,
        message,
        timestamp: env.ledger().timestamp(),
        is_anonymous,
        is_encrypted,
        pseudonym,
    };

    env.storage().temporary().set(&key, &tip);
    storage::set_tip_ttl(env, &key);
}

/// Retrieve a single tip by its ID (internal truth â€” includes the real sender).
///
/// Used by refund flows that must resolve the actual tipper.
pub fn get_tip(env: &Env, tip_id: u32) -> Option<Tip> {
    env.storage().temporary().get(&DataKey::Tip(tip_id))
}

/// Replace identifying sender data on anonymous tips for public views.
///
/// The stored tip keeps its real sender internally (needed for refunds);
/// only public reads are masked. The stable `pseudonym` hash remains so
/// clients can still group tips from one anonymous tipper.
fn redact_public_tip(env: &Env, mut tip: Tip) -> Tip {
    if tip.is_anonymous {
        tip.sender = env.current_contract_address();
    }
    tip
}

/// Retrieve a single tip by its ID for public display.
///
/// Anonymous tips have their sender replaced with the contract address;
/// non-anonymous tips are returned unchanged.
pub fn get_tip_public(env: &Env, tip_id: u32) -> Option<Tip> {
    get_tip(env, tip_id).map(|tip| redact_public_tip(env, tip))
}

/// Maximum number of tips returned per page.
const MAX_PAGE_LIMIT: u32 = 50;

/// Return up to `limit` recent tips received by `creator`, newest first,
/// starting from `offset` entries back in the creator's tip index.
///
/// - `limit` is capped at 50.
/// - `offset` of 0 means start from the most recent tip.
/// - Expired tips are silently skipped; the result may contain fewer entries.
pub fn get_recent_tips(env: &Env, creator: &Address, limit: u32, offset: u32) -> Vec<Tip> {
    let limit = if limit > MAX_PAGE_LIMIT {
        MAX_PAGE_LIMIT
    } else {
        limit
    };
    let count = storage::get_creator_tip_count(env, creator);
    let mut result = Vec::new(env);
    let mut found = 0_u32;

    // Start iterating from (count - offset) downward
    let start = count.saturating_sub(offset);
    let mut index = start;

    while index > 0 && found < limit {
        index -= 1;
        if let Some(tip_id) = env
            .storage()
            .temporary()
            .get::<DataKey, u32>(&DataKey::CreatorTip(creator.clone(), index))
        {
            if let Some(tip) = get_tip(env, tip_id) {
                result.push_back(redact_public_tip(env, tip));
                found += 1;
            }
        }
    }

    result
}

/// Return up to `limit` recent tips sent by `tipper`, newest first.
///
/// This is the tipper's own view: senders are NOT redacted, so a tipper
/// always sees the real addresses behind their own tips.
///
/// Expired tips are silently skipped, so the returned vector may contain fewer
/// than `limit` entries.
pub fn get_tips_by_tipper(env: &Env, tipper: &Address, limit: u32) -> Vec<Tip> {
    let count = storage::get_tipper_tip_count(env, tipper);
    let mut result = Vec::new(env);
    let mut found = 0_u32;
    let mut index = count;

    while index > 0 && found < limit {
        index -= 1;
        if let Some(tip_id) = env
            .storage()
            .temporary()
            .get::<DataKey, u32>(&DataKey::TipperTip(tipper.clone(), index))
        {
            if let Some(tip) = get_tip(env, tip_id) {
                result.push_back(tip);
                found += 1;
            }
        }
    }

    result
}

/// Maximum tip amount accepted per single call (100 000 XLM in stroops).
pub const MAX_TIP_AMOUNT: i128 = 1_000_000_000_000_i128;

/// Maximum per-creator tip count stored in the profile.
pub const MAX_TIP_COUNT: u32 = u32::MAX;

/// Block a tipper from sending future tips to `creator`.
pub fn block_tipper(env: &Env, creator: &Address, tipper: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    creator.require_auth();
    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }
    if creator == tipper {
        return Err(ContractError::CannotTipSelf);
    }
    if storage::is_creator_blocked_tipper(env, creator, tipper) {
        return Ok(());
    }
    if storage::get_creator_blocked_tipper_count(env, creator) >= MAX_CREATOR_BLOCKED_TIPPERS {
        return Err(ContractError::BlocklistLimitReached);
    }
    storage::set_creator_blocked_tipper(env, creator, tipper, env.ledger().timestamp());
    crate::events::emit_tipper_blocked(env, creator, tipper);
    Ok(())
}

/// Remove a tipper from `creator`'s blocklist.
pub fn unblock_tipper(env: &Env, creator: &Address, tipper: &Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    creator.require_auth();
    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }
    storage::remove_creator_blocked_tipper(env, creator, tipper);
    crate::events::emit_tipper_unblocked(env, creator, tipper);
    Ok(())
}

pub fn is_tipper_blocked(env: &Env, creator: &Address, tipper: &Address) -> bool {
    storage::is_creator_blocked_tipper(env, creator, tipper)
}

pub fn get_blocked_tipper_count(env: &Env, creator: &Address) -> u32 {
    storage::get_creator_blocked_tipper_count(env, creator)
}

/// Abort when the caller pinned min-tip or fee values that no longer match
/// current config. Runs before any mutation or event so a rejected tip leaves
/// contract state unchanged. Omitting both params is a no-op.
fn check_pinned_config(
    env: &Env,
    expected_min_tip: Option<i128>,
    expected_fee_bps: Option<u32>,
) -> Result<(), ContractError> {
    if expected_min_tip.is_none() && expected_fee_bps.is_none() {
        return Ok(());
    }

    let config = storage::get_runtime_config(env).ok_or(ContractError::NotInitialized)?;
    if let Some(expected) = expected_min_tip {
        if expected != config.min_tip_amount {
            return Err(ContractError::ConfigMismatch);
        }
    }
    if let Some(expected) = expected_fee_bps {
        if expected != config.fee_bps {
            return Err(ContractError::ConfigMismatch);
        }
    }
    Ok(())
}

/// Send an XLM tip from `tipper` to a registered `creator`.
///
/// `expected_min_tip` and `expected_fee_bps` let the caller pin the config the
/// UI displayed. A mismatch aborts with [`ContractError::ConfigMismatch`]
/// before any state change. Omitting either value (passing `None`) skips that
/// check.
pub fn send_tip(
    env: &Env,
    tipper: &Address,
    creator: &Address,
    amount: i128,
    message: &String,
    is_anonymous: bool,
    is_encrypted: bool,
    expected_min_tip: Option<i128>,
    expected_fee_bps: Option<u32>,
) -> Result<(), ContractError> {
    check_pinned_config(env, expected_min_tip, expected_fee_bps)?;
    storage::extend_instance_ttl(env);
    let config = storage::get_runtime_config(env).ok_or(ContractError::NotInitialized)?;
    if storage::is_paused(env, crate::types::PauseFlag::Tips) || storage::is_paused(env, crate::types::PauseFlag::All) {
        return Err(ContractError::ContractPaused);
    }
    tipper.require_auth();
    crate::validation::check_rate_limit_with_config(
        env,
        tipper,
        &config.admin,
        &config.rate_limit,
    )?;

    let mut profile = storage::get_profile_opt(env, creator).ok_or(ContractError::NotRegistered)?;

    if tipper == creator {
        return Err(ContractError::CannotTipSelf);
    }

    if storage::is_profile_deactivated(env, creator) {
        return Err(ContractError::ProfileDeactivated);
    }
    if storage::is_creator_blocked_tipper(env, creator, tipper) {
        return Err(ContractError::TipperBlocked);
    }

    validate_tip_for_creator(env, creator, amount)?;
    validate_message(message)?;

    let contract_address = env.current_contract_address();
    // Set reentrancy guard before external token call
    storage::set_reentrancy_guard(env, true);
    // Security: native SAC transfer has no callback path into this contract.
    token::transfer_xlm_with_token(env, &config.native_token, tipper, &contract_address, amount)?;
    // Clear reentrancy guard after the transfer completes
    storage::set_reentrancy_guard(env, false);

    profile.balance = profile
        .balance
        .checked_add(amount)
        .ok_or(ContractError::OverflowError)?;
    profile.total_tips_received = profile
        .total_tips_received
        .checked_add(amount)
        .ok_or(ContractError::OverflowError)?;
    profile.total_tips_count = profile
        .total_tips_count
        .checked_add(1)
        .ok_or(ContractError::OverflowError)?;

    // Update streak tracking before recomputing the creator score.
    streaks::record_tip_streak(env, tipper, creator);

    // Update credit score based on new tip totals
    profile.credit_score =
        credit::calculate_credit_score_with_streak(env, &profile, env.ledger().timestamp());

    storage::set_profile(env, &profile);
    // Record when this score was stored for staleness reporting (#1186).
    credit::mark_credit_computed(env, creator);

    // Track sender-creator volume for leaderboard concentration cap
    let sender_creator_volume = storage::add_sender_creator_volume(env, tipper, creator, amount);
    let max_contribution_bps = config.max_sender_contribution_bps;

    // Calculate the amount that counts towards leaderboard (apply concentration cap)
    let leaderboard_amount = if max_contribution_bps >= 10000 {
        amount // No cap
    } else {
        let max_allowed = profile.total_tips_received
            .checked_mul(max_contribution_bps as i128)
            .and_then(|v| v.checked_div(10000))
            .unwrap_or(amount);
        let previous_sender_volume = sender_creator_volume.saturating_sub(amount);
        if previous_sender_volume >= max_allowed {
            0 // Sender already at cap, no leaderboard credit
        } else {
            let remaining = max_allowed.saturating_sub(previous_sender_volume);
            if amount > remaining {
                remaining
            } else {
                amount
            }
        }
    };

    leaderboard::update_all_leaderboards_for_active(env, &profile, leaderboard_amount);

    // Update goal progress
    crate::goals::update_goal_progress(env, creator, amount);

    // Bump TTL for both Profile and UsernameToAddress together.
    storage::bump_existing_profile_ttl(env, creator);
    storage::bump_username_ttl(env, &profile.username);

    let mut tip_state = storage::get_or_build_send_tip_state(env);
    let tip_id = tip_state.tip_count;
    tip_state.tip_count += 1;
    tip_state.total_tips_volume = tip_state
        .total_tips_volume
        .checked_add(amount)
        .ok_or(ContractError::OverflowError)?;

    let now = env.ledger().timestamp();
    if now - tip_state.stats_window_start > 86400 {
        tip_state.stats_window_start = now;
        tip_state.tips_last_24h = 1;
        tip_state.volume_last_24h = amount;
    } else {
        // Saturating: the 24h counters are accumulators that must never
        // overflow under overflow-checks = true (issue #042).
        tip_state.tips_last_24h = tip_state.tips_last_24h.saturating_add(1);
        tip_state.volume_last_24h = tip_state.volume_last_24h.saturating_add(amount);
    }

    store_tip_with_id(
        env,
        tip_id,
        tipper,
        None,
        creator,
        amount,
        message.clone(),
        is_anonymous,
        is_encrypted,
    );
    storage::add_tipper_tip(env, tipper, tip_id);
    storage::add_creator_tip(env, creator, tip_id);
    let timestamp = now;

    storage::apply_send_tip_state(env, &tip_state);
    storage::set_creator_last_active(env, creator, now);

    emit_tip_sent(
        env,
        tip_id,
        tipper,
        creator,
        amount,
        message,
        timestamp,
        is_anonymous,
        is_encrypted,
    );

    Ok(())
}

/// Send a tip on behalf of someone else.
pub fn send_tip_on_behalf(
    env: &Env,
    sender: &Address,
    on_behalf_of: &Address,
    creator: &Address,
    amount: i128,
    message: &String,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    sender.require_auth();
    on_behalf_of.require_auth();
    crate::validation::check_rate_limit(env, sender)?;

    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    if storage::is_profile_deactivated(env, creator) {
        return Err(ContractError::ProfileDeactivated);
    }

    if sender == creator || on_behalf_of == creator {
        return Err(ContractError::CannotTipSelf);
    }

    validate_tip_for_creator(env, creator, amount)?;
    validate_message(message)?;

    let contract_address = env.current_contract_address();
    // Set reentrancy guard before external token call
    storage::set_reentrancy_guard(env, true);
    token::transfer_xlm(env, sender, &contract_address, amount)?;
    // Clear reentrancy guard after the transfer completes
    storage::set_reentrancy_guard(env, false);

    let mut profile = storage::get_profile(env, creator);
    profile.balance = profile
        .balance
        .checked_add(amount)
        .ok_or(ContractError::OverflowError)?;
    profile.total_tips_received = profile
        .total_tips_received
        .checked_add(amount)
        .ok_or(ContractError::OverflowError)?;
    profile.total_tips_count = profile
        .total_tips_count
        .checked_add(1)
        .ok_or(ContractError::OverflowError)?;

    profile.credit_score = credit::calculate_credit_score(&profile, env.ledger().timestamp());

    storage::set_profile(env, &profile);
    credit::mark_credit_computed(env, creator);
    leaderboard::update_all_leaderboards(env, &profile, amount);

    storage::bump_profile_ttl(env, creator);
    storage::bump_username_ttl(env, &profile.username);

    let tip_id = store_tip(
        env,
        sender,
        Some(on_behalf_of.clone()),
        creator,
        amount,
        message.clone(),
        false,
        false,
    );
    storage::add_tipper_tip(env, sender, tip_id);
    storage::add_tipper_tip(env, on_behalf_of, tip_id); // Also show in benefactor's history
    storage::add_creator_tip(env, creator, tip_id);
    let timestamp = env.ledger().timestamp();

    storage::add_to_tips_volume(env, amount)?;
    crate::stats::update_24h_stats(env, amount);
    crate::stats::mark_creator_active(env, creator);

    emit_tip_sent(
        env, tip_id, sender, creator, amount, message, timestamp, false, false,
    );

    Ok(())
}
