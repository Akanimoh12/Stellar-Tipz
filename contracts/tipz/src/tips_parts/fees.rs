
/// Withdraw accumulated tips from the caller's profile balance.
///
/// The withdrawal amount is split into a protocol fee (sent to the fee
/// collector) and the net amount (sent to the creator). The fee is calculated
/// using the current `fee_bps` setting.
///
/// # Parameters
/// - `caller` â€“ the creator withdrawing their tips (must be registered)
/// - `amount` â€“ the gross withdrawal amount in stroops (must be > 0 and â‰¤ balance)
///
/// # Errors
/// - [`ContractError::NotRegistered`] if `caller` has no profile
/// - [`ContractError::InvalidAmount`] if `amount` is â‰¤ 0
/// - [`ContractError::InsufficientBalance`] if `amount` > profile balance or contract lacks XLM
pub fn withdraw_tips(env: &Env, caller: &Address, amount: i128) -> Result<(), ContractError> {
    if storage::is_paused(env, crate::types::PauseFlag::Withdrawals) || storage::is_paused(env, crate::types::PauseFlag::All) {
        return Err(ContractError::ContractPaused);
    }
    caller.require_auth();

    if !storage::has_profile(env, caller) {
        return Err(ContractError::NotRegistered);
    }

    let mut profile = storage::get_profile(env, caller);
    let amount = crate::validation::validate_withdrawal_amount(
        amount,
        storage::get_min_withdrawal_amount(env),
        profile.balance,
    )?;

    // Calculate fee and net amount
    let fee_bps = storage::get_fee_bps(env);
    // Security: fee path is mandatory for all withdrawals (no fee bypass branch).
    let (fee, net) = crate::fees::calculate_fee(amount, fee_bps)?;

    let contract_address = env.current_contract_address();
    let fee_collector = storage::get_fee_collector(env);

    crate::circuit_breaker::record_withdrawal_or_trip(env, amount)?;
    // Set reentrancy guard before external token calls
    storage::set_reentrancy_guard(env, true);
    // Transfer net amount to creator
    token::transfer_xlm(env, &contract_address, caller, net)?;
    // Clear reentrancy guard after first transfer
    storage::set_reentrancy_guard(env, false);

    // Transfer fee to collector (if fee > 0)
    if fee > 0 {
        storage::set_reentrancy_guard(env, true);
        token::transfer_xlm(env, &contract_address, &fee_collector, fee)?;
        // Clear reentrancy guard after second transfer
        storage::set_reentrancy_guard(env, false);
    }

    // Update profile balance
    profile.balance -= amount;
    storage::set_profile(env, &profile);

    // Bump TTL for both Profile and UsernameToAddress together.
    storage::bump_profile_ttl(env, caller);
    storage::bump_username_ttl(env, &profile.username);

    // Update global fees counter
    if fee > 0 {
        storage::add_to_fees(env, fee)?;
    }

    // Emit withdrawal event: (creator, net, fee)
    crate::events::emit_tips_withdrawn(env, caller, net, fee);

    // Emit fee collection event with operation kind and fee_bps for historical reconciliation
    crate::events::emit_fee_collected(env, "withdrawal", caller, amount, fee, net, fee_bps);

    Ok(())
}

/// Time-delayed emergency withdrawal that survives contract pause (#1178).
///
/// If the contract remains paused past `EMERGENCY_WITHDRAWAL_DELAY_SECS` (7 days),
/// creators may withdraw their accrued tips fee-free even while paused.
pub fn emergency_withdraw_tips(
    env: &Env,
    caller: &Address,
    amount: i128,
) -> Result<(), ContractError> {
    caller.require_auth();

    if !storage::is_paused(env) {
        return Err(ContractError::ContractNotPaused);
    }

    let paused_at = storage::get_paused_at(env).ok_or(ContractError::ContractNotPaused)?;
    let now = env.ledger().timestamp();
    let threshold = paused_at.saturating_add(crate::admin::EMERGENCY_WITHDRAWAL_DELAY_SECS);

    if now < threshold {
        return Err(ContractError::EmergencyNotAllowed);
    }

    if !storage::has_profile(env, caller) {
        return Err(ContractError::NotRegistered);
    }

    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    let mut profile = storage::get_profile(env, caller);
    if profile.balance < amount {
        return Err(ContractError::InsufficientBalance);
    }

    let contract_address = env.current_contract_address();

    // Set reentrancy guard before external token call
    storage::set_reentrancy_guard(env, true);
    // Transfer full requested amount without charging fees (fee-free emergency exit)
    token::transfer_xlm(env, &contract_address, caller, amount)?;
    // Clear reentrancy guard after the transfer completes
    storage::set_reentrancy_guard(env, false);

    profile.balance -= amount;
    storage::set_profile(env, &profile);

    storage::bump_profile_ttl(env, caller);
    storage::bump_username_ttl(env, &profile.username);

    // Emit distinct emergency withdrawal event
    crate::events::emit_emergency_withdrawal(env, caller, amount);

    Ok(())
}

/// Schedule a tip for future delivery.
///
/// The tip amount is locked in the contract until the delivery time.
/// The sender can cancel the tip before delivery (with a cancellation fee).
///
/// # Parameters
/// - `sender` â€“ the address scheduling the tip
/// - `creator` â€“ the recipient creator address
/// - `amount` â€“ the tip amount in stroops
/// - `message` â€“ optional message for the tip
/// - `deliver_at` â€“ timestamp when the tip should be delivered
///
/// # Errors
/// - [`ContractError::NotInitialized`] if contract not initialized
/// - [`ContractError::ContractPaused`] if contract is paused
/// - [`ContractError::NotRegistered`] if creator has no profile
/// - [`ContractError::ProfileDeactivated`] if creator profile is deactivated
/// - [`ContractError::CannotTipSelf`] if sender == creator
/// - [`ContractError::InvalidAmount`] if amount <= 0
/// - [`ContractError::InvalidInput`] if deliver_at is in the past
pub fn send_scheduled_tip(
    env: &Env,
    sender: &Address,
    creator: &Address,
    amount: i128,
    message: &String,
    deliver_at: u64,
) -> Result<u32, ContractError> {
    storage::extend_instance_ttl(env);
    let config = storage::get_runtime_config(env).ok_or(ContractError::NotInitialized)?;
    if storage::is_paused(env, crate::types::PauseFlag::Tips) || storage::is_paused(env, crate::types::PauseFlag::All) {
        return Err(ContractError::ContractPaused);
    }
    sender.require_auth();
    crate::validation::check_rate_limit_with_config(
        env,
        sender,
        &config.admin,
        &config.rate_limit,
    )?;

    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    if storage::is_profile_deactivated(env, creator) {
        return Err(ContractError::ProfileDeactivated);
    }

    if sender == creator {
        return Err(ContractError::CannotTipSelf);
    }

    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    let now = env.ledger().timestamp();
    if deliver_at <= now {
        return Err(ContractError::InvalidInput);
    }

    validate_message(message)?;

    // Lock the funds in the contract
    let contract_address = env.current_contract_address();
    token::transfer_xlm_with_token(env, &config.native_token, sender, &contract_address, amount)?;

    // Create scheduled tip
    let scheduled_tip_id = storage::increment_scheduled_tip_count(env);
    let scheduled_tip = ScheduledTip {
        id: scheduled_tip_id,
        sender: sender.clone(),
        creator: creator.clone(),
        amount,
        message: message.clone(),
        deliver_at,
        delivered: false,
        delivered_at: None,
        cancelled: false,
        cancelled_at: None,
        created_at: now,
    };

    storage::set_scheduled_tip(env, scheduled_tip_id, &scheduled_tip);
    storage::add_sender_scheduled_tip(env, sender, scheduled_tip_id);
    storage::add_creator_scheduled_tip(env, creator, scheduled_tip_id);

    // Emit event
    crate::events::emit_scheduled_tip_created(
        env,
        scheduled_tip_id,
        sender,
        creator,
        amount,
        deliver_at,
    );

    Ok(scheduled_tip_id)
}

/// Deliver a scheduled tip at or after the scheduled time.
///
/// This can be called by anyone after the delivery time has passed.
/// The tip is transferred to the creator's balance.
///
/// # Parameters
/// - `scheduled_tip_id` â€“ the ID of the scheduled tip to deliver
///
/// # Errors
/// - [`ContractError::NotFound`] if scheduled tip doesn't exist
/// - [`ContractError::InvalidInput`] if tip already delivered or cancelled
/// - [`ContractError::InvalidInput`] if delivery time hasn't passed yet
pub fn deliver_scheduled_tip(env: &Env, scheduled_tip_id: u32) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;

    let mut scheduled_tip =
        storage::get_scheduled_tip(env, scheduled_tip_id).ok_or(ContractError::NotFound)?;

    if scheduled_tip.delivered {
        return Err(ContractError::InvalidInput);
    }

    if scheduled_tip.cancelled {
        return Err(ContractError::InvalidInput);
    }

    let now = env.ledger().timestamp();
    if now < scheduled_tip.deliver_at {
        return Err(ContractError::InvalidInput);
    }

    // Mark as delivered
    scheduled_tip.delivered = true;
    scheduled_tip.delivered_at = Some(now);
    storage::set_scheduled_tip(env, scheduled_tip_id, &scheduled_tip);

    // Update creator profile
    let mut profile = storage::get_profile(env, &scheduled_tip.creator);
    profile.balance = profile
        .balance
        .checked_add(scheduled_tip.amount)
        .ok_or(ContractError::OverflowError)?;
    profile.total_tips_received = profile
        .total_tips_received
        .checked_add(scheduled_tip.amount)
        .ok_or(ContractError::OverflowError)?;
    profile.total_tips_count = profile
        .total_tips_count
        .checked_add(1)
        .ok_or(ContractError::OverflowError)?;

    // Update streak tracking
    streaks::record_tip_streak(env, &scheduled_tip.sender, &scheduled_tip.creator);

    // Update credit score
    profile.credit_score = credit::calculate_credit_score_with_streak(env, &profile, now);

    storage::set_profile(env, &profile);
    credit::mark_credit_computed(env, &scheduled_tip.creator);
    leaderboard::update_all_leaderboards_for_active(env, &profile, scheduled_tip.amount);

    // Update goal progress
    crate::goals::update_goal_progress(env, &scheduled_tip.creator, scheduled_tip.amount);

    // Bump TTL
    storage::bump_existing_profile_ttl(env, &scheduled_tip.creator);
    storage::bump_username_ttl(env, &profile.username);

    // Create a regular tip record
    let tip_id = store_tip(
        env,
        &scheduled_tip.sender,
        None,
        &scheduled_tip.creator,
        scheduled_tip.amount,
        scheduled_tip.message.clone(),
        false,
        false,
    );
    storage::add_tipper_tip(env, &scheduled_tip.sender, tip_id);
    storage::add_creator_tip(env, &scheduled_tip.creator, tip_id);

    // Update stats
    storage::add_to_tips_volume(env, scheduled_tip.amount)?;
    crate::stats::update_24h_stats(env, scheduled_tip.amount);
    crate::stats::mark_creator_active(env, &scheduled_tip.creator);

    // Emit tip sent event
    emit_tip_sent(
        env,
        tip_id,
        &scheduled_tip.sender,
        &scheduled_tip.creator,
        scheduled_tip.amount,
        &scheduled_tip.message,
        now,
        false,
        false,
    );

    // Emit scheduled tip delivered event
    crate::events::emit_scheduled_tip_delivered(env, scheduled_tip_id, &scheduled_tip.creator);

    Ok(())
}

/// Cancel a scheduled tip before delivery.
///
/// The sender can cancel the tip and receive a refund minus a cancellation fee.
///
/// # Parameters
/// - `scheduled_tip_id` â€“ the ID of the scheduled tip to cancel
///
/// # Errors
/// - [`ContractError::NotFound`] if scheduled tip doesn't exist
/// - [`ContractError::InvalidInput`] if tip already delivered or cancelled
/// - [`ContractError::InvalidInput`] if delivery time has already passed
/// - [`ContractError::Unauthorized`] if caller is not the sender
pub fn cancel_scheduled_tip(
    env: &Env,
    caller: &Address,
    scheduled_tip_id: u32,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    caller.require_auth();

    let mut scheduled_tip =
        storage::get_scheduled_tip(env, scheduled_tip_id).ok_or(ContractError::NotFound)?;

    if scheduled_tip.sender != *caller {
        return Err(ContractError::NotAuthorized);
    }

    if scheduled_tip.delivered {
        return Err(ContractError::InvalidInput);
    }

    if scheduled_tip.cancelled {
        return Err(ContractError::InvalidInput);
    }

    let now = env.ledger().timestamp();
    if now >= scheduled_tip.deliver_at {
        return Err(ContractError::InvalidInput);
    }

    // Mark as cancelled
    scheduled_tip.cancelled = true;
    scheduled_tip.cancelled_at = Some(now);
    storage::set_scheduled_tip(env, scheduled_tip_id, &scheduled_tip);

    // Calculate refund with cancellation fee (1% fee)
    let cancellation_fee = scheduled_tip.amount / 100;
    let refund_amount = scheduled_tip.amount - cancellation_fee;

    // Set reentrancy guard before external token calls
    storage::set_reentrancy_guard(env, true);
    // Refund the sender
    let contract_address = env.current_contract_address();
    token::transfer_xlm(env, &contract_address, &scheduled_tip.sender, refund_amount)?;
    // Clear reentrancy guard after refund
    storage::set_reentrancy_guard(env, false);

    // Send cancellation fee to fee collector
    if cancellation_fee > 0 {
        storage::set_reentrancy_guard(env, true);
        let fee_collector = storage::get_fee_collector(env);
        token::transfer_xlm(env, &contract_address, &fee_collector, cancellation_fee)?;
        // Clear reentrancy guard after fee transfer
        storage::set_reentrancy_guard(env, false);
        storage::add_to_fees(env, cancellation_fee)?;
    }

    // Emit event
    crate::events::emit_scheduled_tip_cancelled(
        env,
        scheduled_tip_id,
        &scheduled_tip.sender,
        refund_amount,
        cancellation_fee,
    );

    Ok(())
}

/// Get a scheduled tip by ID.
pub fn get_scheduled_tip(env: &Env, scheduled_tip_id: u32) -> Option<ScheduledTip> {
    storage::get_scheduled_tip(env, scheduled_tip_id)
}

/// Get scheduled tips for a sender.
pub fn get_scheduled_tips_by_sender(
    env: &Env,
    sender: &Address,
    limit: u32,
    offset: u32,
) -> Vec<ScheduledTip> {
    let limit = if limit > MAX_PAGE_LIMIT {
        MAX_PAGE_LIMIT
    } else {
        limit
    };
    let ids = storage::get_sender_scheduled_tip_ids(env, sender);
    let mut result = Vec::new(env);
    let mut found = 0_u32;

    for (i, tip_id) in ids.iter().enumerate() {
        if (i as u32) < offset {
            continue;
        }
        if found >= limit {
            break;
        }
        if let Some(tip) = storage::get_scheduled_tip(env, tip_id) {
            result.push_back(tip);
            found += 1;
        }
    }

    result
}

/// Get scheduled tips for a creator.
pub fn get_scheduled_tips_by_creator(
    env: &Env,
    creator: &Address,
    limit: u32,
    offset: u32,
) -> Vec<ScheduledTip> {
    let limit = if limit > MAX_PAGE_LIMIT {
        MAX_PAGE_LIMIT
    } else {
        limit
    };
    let ids = storage::get_creator_scheduled_tip_ids(env, creator);
    let mut result = Vec::new(env);
    let mut found = 0_u32;

    for (i, tip_id) in ids.iter().enumerate() {
        if (i as u32) < offset {
            continue;
        }
        if found >= limit {
            break;
        }
        if let Some(tip) = storage::get_scheduled_tip(env, tip_id) {
            result.push_back(tip);
            found += 1;
        }
    }

    result
