// ──────────────────────────────────────────────────────────────────────────────
// Creator counter
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the total number of registered creators.
pub fn get_total_creators(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TotalCreators)
        .unwrap_or(0)
}

/// Increments the total registered creators counter by one.
pub fn increment_total_creators(env: &Env) {
    let total = get_total_creators(env);
    env.storage()
        .instance()
        .set(&DataKey::TotalCreators, &(total + 1));
}

/// Decrements the total registered creators counter by one.
/// Includes underflow protection (only decrements if total > 0).
pub fn decrement_total_creators(env: &Env) {
    let total = get_total_creators(env);
    if total > 0 {
        env.storage()
            .instance()
            .set(&DataKey::TotalCreators, &(total - 1));
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tips volume tracking
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the lifetime total tip volume in stroops.
pub fn get_total_tips_volume(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalTipsVolume)
        .unwrap_or(0)
}

/// Adds `amount` stroops to the lifetime tip volume.
pub fn add_to_tips_volume(env: &Env, amount: i128) -> Result<(), ContractError> {
    let volume = get_total_tips_volume(env);
    // Security: fail closed on arithmetic overflow.
    let next = volume
        .checked_add(amount)
        .ok_or(ContractError::OverflowError)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalTipsVolume, &next);
    if let Some(mut state) = get_send_tip_state(env) {
        state.total_tips_volume = next;
        set_send_tip_state(env, &state);
    }
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────────
// Fee tracking
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the lifetime total fees collected in stroops.
pub fn get_total_fees(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalFeesCollected)
        .unwrap_or(0)
}

/// Adds `fee` stroops to the lifetime fees collected.
#[allow(dead_code)]
pub fn add_to_fees(env: &Env, fee: i128) -> Result<(), ContractError> {
    let total = get_total_fees(env);
    // Security: fail closed on arithmetic overflow.
    let next = total.checked_add(fee).ok_or(ContractError::OverflowError)?;
    env.storage()
        .instance()
        .set(&DataKey::TotalFeesCollected, &next);
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────────
// Refund storage functions
// ──────────────────────────────────────────────────────────────────────────────

/// Default refund configuration
pub const DEFAULT_REFUND_REQUEST_WINDOW_SECS: u64 = 86400; // 24 hours
pub const DEFAULT_REFUND_RESPONSE_WINDOW_SECS: u64 = 172800; // 48 hours
pub const DEFAULT_NON_REFUNDABLE_FEE_BPS: u32 = 200; // 2%

/// Get refund configuration
pub fn get_refund_config(env: &Env) -> crate::types::RefundConfig {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::RefundConfig)
        .unwrap_or(crate::types::RefundConfig {
            request_window_secs: DEFAULT_REFUND_REQUEST_WINDOW_SECS,
            response_window_secs: DEFAULT_REFUND_RESPONSE_WINDOW_SECS,
            non_refundable_fee_bps: DEFAULT_NON_REFUNDABLE_FEE_BPS,
            request_ttl_ledgers: 518400,
        })
}

/// Set refund configuration (admin only)
pub fn set_refund_config(env: &Env, config: &crate::types::RefundConfig) {
    env.storage()
        .instance()
        .set(&ExtendedDataKey::RefundConfig, config);
}

/// Get the number of pending refund requests tracked on chain.
pub fn get_pending_refund_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::PendingRefundCount)
        .unwrap_or(0)
}

/// Get the pending refund tip ID at a dense index.
pub fn get_pending_refund_tip_id(env: &Env, index: u32) -> Option<u32> {
    env.storage()
        .instance()
        .get(&ExtendedDataKey::PendingRefundTip(index))
}

/// Append a pending refund tip ID to the dense index.
pub fn add_pending_refund_tip_id(env: &Env, tip_id: u32) {
    let count = get_pending_refund_count(env);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::PendingRefundTip(count), &tip_id);
    env.storage()
        .instance()
        .set(&ExtendedDataKey::PendingRefundCount, &(count + 1));
}

/// Remove a pending refund tip ID from the dense index using swap-remove.
pub fn remove_pending_refund_tip_id(env: &Env, tip_id: u32) {
    let count = get_pending_refund_count(env);
    if count == 0 {
        return;
    }

    let mut found_index: Option<u32> = None;
    for i in 0..count {
        if let Some(current_tip_id) = get_pending_refund_tip_id(env, i) {
            if current_tip_id == tip_id {
                found_index = Some(i);
                break;
            }
        }
    }

    let Some(index) = found_index else {
        return;
    };

    let last_index = count - 1;
    if index != last_index {
        if let Some(last_tip_id) = get_pending_refund_tip_id(env, last_index) {
            env.storage()
                .instance()
                .set(&ExtendedDataKey::PendingRefundTip(index), &last_tip_id);
        }
    }

    env.storage()
        .instance()
        .remove(&ExtendedDataKey::PendingRefundTip(last_index));
    env.storage()
        .instance()
        .set(&ExtendedDataKey::PendingRefundCount, &last_index);
}

/// Get refund request by tip ID
pub fn get_refund_request(env: &Env, tip_id: u32) -> Option<crate::types::RefundRequest> {
    env.storage()
        .temporary()
        .get(&ExtendedDataKey::RefundRequest(tip_id))
}

/// Set refund request
pub fn set_refund_request(env: &Env, request: &crate::types::RefundRequest) {
    let key = ExtendedDataKey::RefundRequest(request.tip_id);
    env.storage().temporary().set(&key, request);
    // Use same TTL as tips - we need to use a DataKey for TTL extension
    // Store in temporary with manual TTL
    env.storage()
        .temporary()
        .extend_ttl(&key, TIP_TTL_LEDGERS, TIP_TTL_LEDGERS);
}

/// Remove refund request
pub fn remove_refund_request(env: &Env, tip_id: u32) {
    env.storage()
        .temporary()
        .remove(&ExtendedDataKey::RefundRequest(tip_id));
}

/// Get the list of active subscriptions (subscriber, creator) pairs
pub fn get_active_subscriptions(env: &Env) -> soroban_sdk::Vec<(Address, Address)> {
    env.storage()
        .persistent()
        .get(&ExtendedDataKey::ActiveSubscriptions)
        .unwrap_or_else(|| soroban_sdk::Vec::new(env))
}

/// Add a subscription to the active subscriptions list
pub fn add_active_subscription(env: &Env, subscriber: &Address, creator: &Address) {
    let mut subs = get_active_subscriptions(env);
    subs.push_back((subscriber.clone(), creator.clone()));
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::ActiveSubscriptions, &subs);
}

/// Remove a subscription from the active subscriptions list
pub fn remove_active_subscription(env: &Env, subscriber: &Address, creator: &Address) {
    let mut subs = get_active_subscriptions(env);
    let mut new_subs = soroban_sdk::Vec::new(env);
    for (sub, crt) in subs.iter() {
        if !(sub == *subscriber && crt == *creator) {
            new_subs.push_back((sub, crt));
        }
    }
    env.storage()
        .persistent()
        .set(&ExtendedDataKey::ActiveSubscriptions, &new_subs);
}

