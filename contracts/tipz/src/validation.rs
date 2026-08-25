//! Input validation functions for the Tipz contract.
//!
//! All length limits are derived from constants in [`crate::types`] to ensure
//! consistent enforcement across the codebase.

use crate::errors::ContractError;
use crate::storage;
use crate::types;
use soroban_sdk::{Address, Env, String};

/// Validate a username format.
/// - 3 to 32 characters
/// - lowercase alphanumeric and underscores
/// - must start with a letter
/// - no consecutive underscores
/// - cannot end with an underscore
pub fn validate_username(username: &String) -> Result<(), ContractError> {
    let len = username.len();
    if len < 3 || len > types::MAX_USERNAME_LENGTH {
        return Err(ContractError::InvalidUsername);
    }

    let mut buf = [0u8; types::MAX_USERNAME_LENGTH as usize];
    username.copy_into_slice(&mut buf[..len as usize]);

    // Must start with a letter [a-z]
    if buf[0] < b'a' || buf[0] > b'z' {
        return Err(ContractError::InvalidUsername);
    }

    // Cannot end with an underscore
    if buf[(len - 1) as usize] == b'_' {
        return Err(ContractError::InvalidUsername);
    }

    let mut prev_is_underscore = false;
    let mut has_letter = false;

    for i in 0..len as usize {
        let c = buf[i];
        if (c >= b'a' && c <= b'z') || (c >= b'0' && c <= b'9') || c == b'_' {
            if c == b'_' {
                if prev_is_underscore {
                    return Err(ContractError::InvalidUsername);
                }
                prev_is_underscore = true;
            } else {
                prev_is_underscore = false;
                if c >= b'a' && c <= b'z' {
                    has_letter = true;
                }
            }
        } else {
            return Err(ContractError::InvalidUsername);
        }
    }

    if !has_letter {
        return Err(ContractError::InvalidUsername);
    }

    Ok(())
}

/// Validate a display name (1-64 chars, not just whitespace).
pub fn validate_display_name(display_name: &String) -> Result<(), ContractError> {
    let len = display_name.len();
    if len == 0 || len > types::MAX_DISPLAY_NAME_LENGTH {
        return Err(ContractError::InvalidDisplayName);
    }

    // Check for whitespace only
    let mut buf = [0u8; types::MAX_DISPLAY_NAME_LENGTH as usize];
    display_name.copy_into_slice(&mut buf[..len as usize]);
    let mut only_whitespace = true;
    for i in 0..len as usize {
        if buf[i] != b' ' && buf[i] != b'\t' && buf[i] != b'\n' && buf[i] != b'\r' {
            only_whitespace = false;
            break;
        }
    }

    if only_whitespace {
        return Err(ContractError::InvalidDisplayName);
    }

    Ok(())
}

/// Validate a bio (max 280 chars).
pub fn validate_bio(bio: &String) -> Result<(), ContractError> {
    if bio.len() > types::MAX_BIO_LENGTH {
        return Err(ContractError::MessageTooLong);
    }
    Ok(())
}

/// Validate a message (max 280 chars).
pub fn validate_message(message: &String) -> Result<(), ContractError> {
    if message.len() > types::MAX_MESSAGE_LENGTH {
        return Err(ContractError::MessageTooLong);
    }

    if message.len() > 0 {
        let mut buf = [0u8; types::MAX_MESSAGE_LENGTH as usize];
        let n = message.len() as usize;
        message.copy_into_slice(&mut buf[..n]);
        for &b in &buf[..n] {
            if b < 0x20 && b != b'\n' && b != b'\t' && b != b'\r' {
                return Err(ContractError::InvalidMessage);
            }
        }
    }

    Ok(())
}

/// Validate an image URL (max 256 chars).
pub fn validate_image_url(url: &String) -> Result<(), ContractError> {
    if url.len() > 256 {
        return Err(ContractError::InvalidImageUrl);
    }
    Ok(())
}

/// Validate a tip amount against a single minimum threshold.
pub fn validate_tip_amount(amount: i128, min_amount: i128) -> Result<(), ContractError> {
    if amount < min_amount {
        return Err(ContractError::TipBelowMinimum);
    }
    Ok(())
}

pub fn validate_withdrawal_amount(amount: i128, min_amount: i128, balance: i128) -> Result<i128, ContractError> {
    if amount < 0 { return Err(ContractError::InvalidAmount); }
    if balance <= 0 { return Err(ContractError::InsufficientBalance); }
    if amount == 0 { return Ok(balance); }
    if amount < min_amount { return Err(ContractError::WdrBelowMin); }
    if amount > balance { return Err(ContractError::InsufficientBalance); }
    Ok(amount)
}

/// Validate a tip amount against the creator's effective minimum.
///
/// Uses the creator's custom minimum when set, otherwise the global minimum.
/// Returns [`ContractError::BelowCreatorMinimum`] when below a custom minimum,
/// and [`ContractError::TipBelowMinimum`] when below the global default.
pub fn validate_tip_for_creator(
    env: &Env,
    creator: &Address,
    amount: i128,
) -> Result<(), ContractError> {
    let effective_min = storage::get_effective_creator_min_tip(env, creator);
    if amount >= effective_min {
        return Ok(());
    }

    if storage::get_creator_min_tip_override(env, creator).is_some() {
        Err(ContractError::BelowCreatorMinimum)
    } else {
        Err(ContractError::TipBelowMinimum)
    }
}

/// Validate a domain name for stellar.toml verification (basic format check).
pub fn validate_domain(domain: &String) -> Result<(), ContractError> {
    let len = domain.len();
    if len == 0 || len > 253 {
        return Err(ContractError::InvalidDomain);
    }

    let mut buf = [0u8; 253];
    domain.copy_into_slice(&mut buf[..len as usize]);

    // Must contain at least one dot and valid hostname characters.
    let mut has_dot = false;
    for i in 0..len as usize {
        let c = buf[i];
        if c == b'.' {
            has_dot = true;
        } else if !((c >= b'a' && c <= b'z')
            || (c >= b'A' && c <= b'Z')
            || (c >= b'0' && c <= b'9')
            || c == b'-')
        {
            return Err(ContractError::InvalidDomain);
        }
    }

    if !has_dot {
        return Err(ContractError::InvalidDomain);
    }

    Ok(())
}

/// Validate an X handle (alphanumeric + underscores, max 15 chars after @).
pub fn validate_x_handle(handle: &String) -> Result<(), ContractError> {
    let len = handle.len();
    if len == 0 {
        return Err(ContractError::InvalidUsername);
    }

    let mut buf = [0u8; 17]; // max 1 + 15
    if len > 16 {
        return Err(ContractError::InvalidUsername);
    }
    handle.copy_into_slice(&mut buf[..len as usize]);

    let start = if buf[0] == b'@' { 1 } else { 0 };
    let handle_len = len as usize - start;

    if handle_len == 0 || handle_len > 15 {
        return Err(ContractError::InvalidUsername);
    }

    for i in start..len as usize {
        let c = buf[i];
        if !((c >= b'a' && c <= b'z')
            || (c >= b'A' && c <= b'Z')
            || (c >= b'0' && c <= b'9')
            || c == b'_')
        {
            return Err(ContractError::InvalidUsername);
        }
    }

    Ok(())
}

/// Check if an address is rate limited.
pub fn check_rate_limit(env: &Env, address: &Address) -> Result<(), ContractError> {
    // Admin is exempt
    if storage::is_initialized(env) && address == &storage::get_admin(env) {
        return Ok(());
    }

    let config = storage::get_rate_limit_config(env);
    let mut status =
        storage::get_rate_limit_status(env, address).unwrap_or(crate::types::RateLimitStatus {
            count: 0,
            last_op_time: 0,
        });

    let now = env.ledger().timestamp();
    if now >= status.last_op_time.saturating_add(config.window_secs) {
        // Reset window
        status.count = 1;
        status.last_op_time = now;
    } else {
        if status.count >= config.max_ops {
            return Err(ContractError::RateLimitExceeded);
        }
        status.count += 1;
    }

    storage::set_rate_limit_status(env, address, &status);
    Ok(())
}

pub fn check_rate_limit_with_config(
    env: &Env,
    address: &Address,
    admin: &Address,
    config: &crate::types::RateLimitConfig,
) -> Result<(), ContractError> {
    if address == admin {
        return Ok(());
    }

    let mut status =
        storage::get_rate_limit_status(env, address).unwrap_or(crate::types::RateLimitStatus {
            count: 0,
            last_op_time: 0,
        });

    let now = env.ledger().timestamp();
    if now >= status.last_op_time.saturating_add(config.window_secs) {
        status.count = 1;
        status.last_op_time = now;
    } else {
        if status.count >= config.max_ops {
            return Err(ContractError::RateLimitExceeded);
        }
        status.count += 1;
    }

    storage::set_rate_limit_status(env, address, &status);
    Ok(())
}

/// Check profile count against the maximum allowed to prevent storage DoS.
pub fn validate_profile_count(env: &Env) -> Result<(), ContractError> {
    let total = storage::get_total_creators(env);
    if total >= types::MAX_PROFILES {
        return Err(ContractError::MaxProfilesReached);
    }
    Ok(())
}

/// Check registration-specific rate limiting for an address.
///
/// Uses a separate counter from the general-purpose rate limiter
/// to prevent an attacker from exhausting the registration budget
/// with cheap non-registration operations.
pub fn validate_registration_rate_limit(
    env: &Env,
    address: &Address,
) -> Result<(), ContractError> {
    let mut status =
        storage::get_rate_limit_status(env, address).unwrap_or(crate::types::RateLimitStatus {
            count: 0,
            last_op_time: 0,
        });

    let now = env.ledger().timestamp();
    if now
        >= status
            .last_op_time
            .saturating_add(types::REGISTRATION_RATE_WINDOW_SECS)
    {
        status.count = 1;
        status.last_op_time = now;
    } else {
        if status.count >= types::MAX_REGISTRATIONS_PER_WINDOW {
            return Err(ContractError::RateLimitExceeded);
        }
        status.count += 1;
    }

    storage::set_rate_limit_status(env, address, &status);
    Ok(())
}
