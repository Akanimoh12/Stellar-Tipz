//! Refund mechanism for tips with time-based windows.
//!
//! Allows tippers to request refunds within a configurable time window (default 24 hours).
//! Creators can approve or reject refund requests. If the creator doesn't respond within
//! a timeout period (default 48 hours), the refund is automatically approved.
//!
//! The platform fee is non-refundable to prevent abuse.

use soroban_sdk::{Address, Env};

use crate::errors::ContractError;
use crate::events::{
    emit_refund_approved, emit_refund_auto_approved, emit_refund_rejected, emit_refund_requested,
};
use crate::storage;
use crate::token;
use crate::types::{RefundRequest, RefundStatus};

/// Request a refund for a tip within the allowed time window.
///
/// # Parameters
/// - `tipper` - The address that sent the tip (must match tip sender)
/// - `tip_id` - The ID of the tip to refund
///
/// # Errors
/// - [`ContractError::NotFound`] - Tip doesn't exist or has expired
/// - [`ContractError::NotTipper`] - Caller is not the tipper
/// - [`ContractError::RefundWindowExpired`] - Request window has passed
/// - [`ContractError::RefundAlreadyRequested`] - Refund already requested for this tip
pub fn request_refund(env: &Env, tipper: &Address, tip_id: u32) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    tipper.require_auth();

    // Get the tip
    let tip = crate::tips::get_tip(env, tip_id).ok_or(ContractError::NotFound)?;

    // Verify caller is the tipper
    if tip.sender != *tipper {
        return Err(ContractError::NotTipper);
    }

    // Check if refund already requested
    if storage::get_refund_request(env, tip_id).is_some() {
        return Err(ContractError::RefundAlreadyRequested);
    }

    // Check if within refund window
    let config = storage::get_refund_config(env);
    let now = env.ledger().timestamp();
    let elapsed = now.saturating_sub(tip.timestamp);

    if elapsed > config.request_window_secs {
        return Err(ContractError::RefundWindowExpired);
    }

    // Calculate refund amount (original amount minus non-refundable fee)
    let non_refundable_fee = calculate_non_refundable_fee(tip.amount, config.non_refundable_fee_bps)?;
    let refund_amount = tip.amount.saturating_sub(non_refundable_fee);

    // Create refund request
    let request = RefundRequest {
        tip_id,
        tipper: tipper.clone(),
        creator: tip.creator.clone(),
        amount: tip.amount,
        requested_at: now,
        status: RefundStatus::Pending,
        processed_at: None,
        refund_amount,
        non_refundable_fee,
    };

    storage::set_refund_request(env, &request);

    emit_refund_requested(
        env,
        tip_id,
        tipper,
        &tip.creator,
        tip.amount,
        refund_amount,
        non_refundable_fee,
    );

    Ok(())
}

/// Creator approves a refund request.
///
/// # Parameters
/// - `creator` - The creator who received the tip
/// - `tip_id` - The ID of the tip to refund
///
/// # Errors
/// - [`ContractError::NoRefundRequest`] - No refund request exists
/// - [`ContractError::NotCreator`] - Caller is not the creator
/// - [`ContractError::RefundAlreadyProcessed`] - Refund already processed
pub fn approve_refund(env: &Env, creator: &Address, tip_id: u32) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    creator.require_auth();

    let mut request = storage::get_refund_request(env, tip_id).ok_or(ContractError::NoRefundRequest)?;

    // Verify caller is the creator
    if request.creator != *creator {
        return Err(ContractError::NotCreator);
    }

    // Check if already processed
    if request.status != RefundStatus::Pending {
        return Err(ContractError::RefundAlreadyProcessed);
    }

    // Process the refund
    process_refund_internal(env, &mut request, RefundStatus::Approved)?;

    emit_refund_approved(env, tip_id, creator, &request.tipper, request.refund_amount);

    Ok(())
}

/// Creator rejects a refund request.
///
/// # Parameters
/// - `creator` - The creator who received the tip
/// - `tip_id` - The ID of the tip to refund
///
/// # Errors
/// - [`ContractError::NoRefundRequest`] - No refund request exists
/// - [`ContractError::NotCreator`] - Caller is not the creator
/// - [`ContractError::RefundAlreadyProcessed`] - Refund already processed
pub fn reject_refund(env: &Env, creator: &Address, tip_id: u32) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    creator.require_auth();

    let mut request = storage::get_refund_request(env, tip_id).ok_or(ContractError::NoRefundRequest)?;

    // Verify caller is the creator
    if request.creator != *creator {
        return Err(ContractError::NotCreator);
    }

    // Check if already processed
    if request.status != RefundStatus::Pending {
        return Err(ContractError::RefundAlreadyProcessed);
    }

    // Update request status
    request.status = RefundStatus::Rejected;
    request.processed_at = Some(env.ledger().timestamp());
    storage::set_refund_request(env, &request);

    emit_refund_rejected(env, tip_id, creator, &request.tipper);

    Ok(())
}

/// Process pending refunds that have exceeded the response window (auto-approve).
///
/// This can be called by anyone to process expired refund requests.
/// Typically called by an off-chain service or the tipper themselves.
///
/// # Parameters
/// - `tip_ids` - List of tip IDs to check and process
///
/// # Returns
/// Number of refunds that were auto-approved
pub fn process_pending_refunds(env: &Env, tip_ids: soroban_sdk::Vec<u32>) -> Result<u32, ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;

    let config = storage::get_refund_config(env);
    let now = env.ledger().timestamp();
    let mut processed_count = 0_u32;

    for tip_id in tip_ids.iter() {
        if let Some(mut request) = storage::get_refund_request(env, tip_id) {
            // Only process pending requests
            if request.status != RefundStatus::Pending {
                continue;
            }

            // Check if response window has expired
            let elapsed = now.saturating_sub(request.requested_at);
            if elapsed >= config.response_window_secs {
                // Auto-approve the refund
                process_refund_internal(env, &mut request, RefundStatus::AutoApproved)?;
                emit_refund_auto_approved(env, tip_id, &request.tipper, request.refund_amount);
                processed_count += 1;
            }
        }
    }

    Ok(processed_count)
}

/// Expire a pending refund request that has exceeded the TTL.
///
/// This can be called by anyone to clean up expired refund requests.
/// Expired requests are removed from storage.
///
/// # Parameters
/// - `tip_id` - The ID of the tip with the refund request to expire
///
/// # Errors
/// - [`ContractError::NoRefundRequest`] - No refund request exists
/// - [`ContractError::RefundAlreadyProcessed`] - Request is not pending
/// - [`ContractError::RefundRequestExpired`] - Request has not yet expired
pub fn expire_refund(env: &Env, tip_id: u32) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;

    let request = storage::get_refund_request(env, tip_id)
        .ok_or(ContractError::NoRefundRequest)?;

    // Only pending requests can expire
    if request.status != RefundStatus::Pending {
        return Err(ContractError::RefundAlreadyProcessed);
    }

    let config = storage::get_refund_config(env);
    let current_ledger = env.ledger().sequence();
    let request_ledger_age = current_ledger.saturating_sub(request.requested_at as u32);

    // Check if request has expired
    if request_ledger_age < config.request_ttl_ledgers {
        return Err(ContractError::RefundRequestExpired);
    }

    // Remove the expired request from storage
    storage::remove_refund_request(env, tip_id);

    // Emit expiry event
    crate::events::emit_refund_expired(env, tip_id, &request.tipper);

    Ok(())
}

/// Internal function to process a refund (transfer funds and update state).
fn process_refund_internal(
    env: &Env,
    request: &mut RefundRequest,
    new_status: RefundStatus,
) -> Result<(), ContractError> {
    let now = env.ledger().timestamp();

    // Update creator's profile (reduce balance and stats)
    let mut creator_profile = storage::get_profile(env, &request.creator);
    
    // Reduce creator's balance by the original tip amount
    creator_profile.balance = creator_profile.balance.saturating_sub(request.amount);
    
    // Reduce total tips received and count
    creator_profile.total_tips_received = creator_profile.total_tips_received.saturating_sub(request.amount);
    creator_profile.total_tips_count = creator_profile.total_tips_count.saturating_sub(1);

    // Recalculate credit score
    creator_profile.credit_score = crate::credit::calculate_credit_score_with_streak(
        env,
        &creator_profile,
        now,
    );

    storage::set_profile(env, &creator_profile);

    // Update leaderboards (subtract the refunded amount)
    crate::leaderboard::update_all_leaderboards_for_refund(env, &creator_profile, request.amount);

    // Transfer refund amount to tipper
    let contract_address = env.current_contract_address();
    token::transfer_xlm(env, &contract_address, &request.tipper, request.refund_amount)?;

    // Non-refundable fee stays in contract (already collected)

    // Emit fee collection event for the non-refundable fee
    let fee_bps = storage::get_fee_bps(env);
    crate::events::emit_fee_collected(
        env,
        "refund",
        &request.tipper,
        request.amount,
        request.non_refundable_fee,
        request.refund_amount,
        fee_bps,
    );

    // Update refund request status
    request.status = new_status;
    request.processed_at = Some(now);
    storage::set_refund_request(env, request);

    Ok(())
}

/// Calculate the non-refundable fee for a refund.
fn calculate_non_refundable_fee(amount: i128, fee_bps: u32) -> Result<i128, ContractError> {
    let fee = amount
        .checked_mul(fee_bps as i128)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(ContractError::OverflowError)?;
    Ok(fee)
}

/// Get refund request by tip ID.
pub fn get_refund_request(env: &Env, tip_id: u32) -> Option<RefundRequest> {
    storage::get_refund_request(env, tip_id)
}

/// Get refund configuration.
pub fn get_refund_config(env: &Env) -> crate::types::RefundConfig {
    storage::get_refund_config(env)
}

/// Set refund configuration (admin only).
pub fn set_refund_config(
    env: &Env,
    admin: &Address,
    config: crate::types::RefundConfig,
) -> Result<(), ContractError> {
    crate::admin::require_admin(env, admin)?;
    storage::set_refund_config(env, &config);
    crate::admin::log_admin_action(
        env,
        admin,
        soroban_sdk::Symbol::new(env, "set_refund_config"),
        soroban_sdk::String::from_str(env, ""),
        soroban_sdk::String::from_str(env, "config_updated"),
    );
    Ok(())
}
