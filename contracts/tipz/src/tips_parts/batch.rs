}

/// Send tips to multiple creators in a single atomic transaction.
///
/// All-or-nothing semantics: if any recipient is invalid or other check fails,
/// the entire batch reverts. Per-tip events emit individually so the indexer
/// needs no changes.
///
/// # Parameters
/// - `tipper` â€“ the address sending all tips (must authenticate)
/// - `recipients` â€“ Vec<(creator_address, amount_in_stroops)>, max 5 entries
/// - `message` â€“ single message for all tips in the batch (max 280 chars)
///
/// # Returns
/// Ok with number of tips processed on success, or ContractError on any failure
/// (which reverts the entire batch).
///
/// # Errors
/// - [`ContractError::BatchTooLarge`] if more than MAX_BATCH_TIP_SIZE recipients
/// - [`ContractError::InvalidInput`] if recipients is empty
/// - [`ContractError::NotRegistered`] if any recipient doesn't have a profile
/// - [`ContractError::CannotTipSelf`] if tipper tries to tip themselves
/// - [`ContractError::TipperBlocked`] if any creator has blocked the tipper
/// - [`ContractError::BelowCreatorMinimum`] if any tip is below creator's minimum
/// - Any other error from send_tip logic (paused, rate limited, etc.)
pub fn batch_tip(
    env: &Env,
    tipper: &Address,
    recipients: Vec<(Address, i128)>,
    message: &String,
) -> Result<u32, ContractError> {
    use crate::types::MAX_BATCH_TIP_SIZE;

    // Validation: check batch size
    let batch_len = recipients.len() as u32;
    if batch_len == 0 {
        return Err(ContractError::InvalidInput);
    }
    if batch_len > MAX_BATCH_TIP_SIZE {
        return Err(ContractError::BatchTooLarge);
    }

    // Pre-flight checks (before any state mutations)
    storage::extend_instance_ttl(env);
    let config = storage::get_runtime_config(env).ok_or(ContractError::NotInitialized)?;
    
    if storage::is_paused(env, crate::types::PauseFlag::Tips)
        || storage::is_paused(env, crate::types::PauseFlag::All)
    {
        return Err(ContractError::ContractPaused);
    }
    
    tipper.require_auth();
    crate::validation::check_rate_limit_with_config(
        env,
        tipper,
        &config.admin,
        &config.rate_limit,
    )?;

    // Validate message once
    validate_message(message)?;

    // Validate all recipients exist and pass pre-flight checks before any transfers
    // This ensures all-or-nothing: if any recipient is invalid, entire batch reverts
    let mut profiles = Vec::new(env);
    for i in 0..batch_len {
        let (creator, amount) = recipients.get(i).unwrap();
        
        // Check creator exists
        let profile = storage::get_profile_opt(env, &creator)
            .ok_or(ContractError::NotRegistered)?;

        // Check self-tipping
        if tipper == &creator {
            return Err(ContractError::CannotTipSelf);
        }

        // Check profile not deactivated
        if storage::is_profile_deactivated(env, &creator) {
            return Err(ContractError::ProfileDeactivated);
        }

        // Check if creator blocked tipper
        if storage::is_creator_blocked_tipper(env, &creator, tipper) {
            return Err(ContractError::TipperBlocked);
        }

        // Validate tip amount
        validate_tip_for_creator(env, &creator, amount)?;

        profiles.push_back(profile);
    }

    // Transfer all tokens (set reentrancy guard once for batch)
    let contract_address = env.current_contract_address();
    storage::set_reentrancy_guard(env, true);
    
    let mut total_amount: i128 = 0;
    for i in 0..batch_len {
        let (_, amount) = recipients.get(i).unwrap();
        total_amount = total_amount
            .checked_add(amount)
            .ok_or(ContractError::OverflowError)?;
    }

    // Single transfer of total amount
    token::transfer_xlm_with_token(env, &config.native_token, tipper, &contract_address, total_amount)?;
    storage::set_reentrancy_guard(env, false);

    // Process each tip (state mutations, events)
    let now = env.ledger().timestamp();
    let mut tip_state = storage::get_or_build_send_tip_state(env);

    for i in 0..batch_len {
        let (creator, amount) = recipients.get(i).unwrap();
        let mut profile = profiles.get(i).unwrap();

        // Update profile balance and counts
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

        // Update streak tracking
        streaks::record_tip_streak(env, tipper, &creator);

        // Update credit score
        profile.credit_score =
            credit::calculate_credit_score_with_streak(env, &profile, now);

        // Persist profile
        storage::set_profile(env, &profile);
        credit::mark_credit_computed(env, &creator);

        // Track sender-creator volume for leaderboard concentration cap
        let sender_creator_volume = storage::add_sender_creator_volume(env, tipper, &creator, amount);
        let max_contribution_bps = config.max_sender_contribution_bps;

        // Calculate leaderboard amount (apply concentration cap)
        let leaderboard_amount = if max_contribution_bps >= 10000 {
            amount
        } else {
            let max_allowed = profile
                .total_tips_received
                .checked_mul(max_contribution_bps as i128)
                .and_then(|v| v.checked_div(10000))
                .unwrap_or(amount);
            let previous_sender_volume = sender_creator_volume.saturating_sub(amount);
            if previous_sender_volume >= max_allowed {
                0
            } else {
                let remaining = max_allowed.saturating_sub(previous_sender_volume);
                if amount > remaining {
                    remaining
                } else {
                    amount
                }
            }
        };

        // Update leaderboards
        leaderboard::update_all_leaderboards_for_active(env, &profile, leaderboard_amount);

        // Update goal progress
        crate::goals::update_goal_progress(env, &creator, amount);

        // Allocate tip ID
        let tip_id = tip_state.tip_count;
        tip_state.tip_count = tip_state.tip_count.checked_add(1)
            .ok_or(ContractError::OverflowError)?;
        tip_state.total_tips_volume = tip_state
            .total_tips_volume
            .checked_add(amount)
            .ok_or(ContractError::OverflowError)?;

        // Update 24h stats
        if now - tip_state.stats_window_start > 86400 {
            tip_state.stats_window_start = now;
            tip_state.tips_last_24h = 1;
            tip_state.volume_last_24h = amount;
        } else {
            tip_state.tips_last_24h = tip_state.tips_last_24h.saturating_add(1);
            tip_state.volume_last_24h = tip_state.volume_last_24h.saturating_add(amount);
        }

        // Store tip record
        store_tip_with_id(
            env,
            tip_id,
            tipper,
            None,
            &creator,
            amount,
            message.clone(),
            false,
            false,
        );
        storage::add_tipper_tip(env, tipper, tip_id);
        storage::add_creator_tip(env, &creator, tip_id);

        // Bump TTLs
        storage::bump_existing_profile_ttl(env, &creator);
        storage::bump_username_ttl(env, &profile.username);
        storage::set_creator_last_active(env, &creator, now);

        // Emit individual tip event (indexer compatibility)
        emit_tip_sent(
            env,
            tip_id,
            tipper,
            &creator,
            amount,
            message,
            now,
            false,
            false,
        );
    }

    // Persist updated state
    storage::apply_send_tip_state(env, &tip_state);

    Ok(batch_len)
}
