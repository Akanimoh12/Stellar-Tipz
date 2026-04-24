//! Profile registration and update logic for the Tipz contract.

use soroban_sdk::{Address, Env, String};

use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::Profile;
use crate::validation;

/// Register a new creator profile.
///
/// # Parameters
/// - `caller`       – address of the creator; must authorise the call.
/// - `username`     – unique handle (3-32 chars, `[a-z0-9_]`, starts with `[a-z]`).
/// - `display_name` – human-readable name (1-64 characters).
/// - `bio`          – short biography (0-280 characters).
/// - `image_url`    – profile image URL or IPFS CID (0-256 characters).
/// - `x_handle`     – optional X (Twitter) handle (stored as-is).
///
/// # Returns
/// The newly created [`Profile`] on success.
///
/// # Errors
/// - [`ContractError::NotInitialized`]    – contract has not been set up yet.
/// - [`ContractError::InvalidUsername`]   – username fails format validation.
/// - [`ContractError::InvalidDisplayName`] – display name is empty or > 64 chars.
/// - [`ContractError::MessageTooLong`]    – bio exceeds 280 characters.
/// - [`ContractError::InvalidImageUrl`]   – image URL exceeds 256 characters.
/// - [`ContractError::AlreadyRegistered`] – caller already has a profile.
/// - [`ContractError::UsernameTaken`]     – username is in use by another address.
pub fn register_profile(
    env: &Env,
    caller: Address,
    username: String,
    display_name: String,
    bio: String,
    image_url: String,
    x_handle: String,
) -> Result<Profile, ContractError> {
    storage::extend_instance_ttl(env);

    crate::admin::require_not_paused(env)?;

    // Require explicit authorisation from the caller.
    caller.require_auth();

    // Contract must be initialised before profiles can be created.
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }

    // --- Input validation (centralized in validation module) ---

    validation::validate_username(&username)?;
    validation::validate_display_name(&display_name)?;
    validation::validate_bio(&bio)?;
    validation::validate_image_url(&image_url)?;
    validation::validate_x_handle(&x_handle)?;

    // Normalize x_handle: prepend @ if missing.
    // Length is already validated (1-16 including optional @).
    let mut normalized_x = x_handle.clone();
    let mut handle_buf = [0u8; 16];
    let n = x_handle.len() as usize;
    x_handle.copy_into_slice(&mut handle_buf[..n]);
    if handle_buf[0] != b'@' {
        let mut full_buf = [0u8; 17];
        full_buf[0] = b'@';
        let n = x_handle.len() as usize;
        x_handle.copy_into_slice(&mut full_buf[1..1 + n]);
        // SAFETY: x_handle is validated to be alphanumeric/underscore ASCII.
        if let Ok(s) = core::str::from_utf8(&full_buf[..1 + n]) {
            normalized_x = String::from_str(env, s);
        }
    }

    // --- Duplicate checks ---

    // Each address may only register once.
    if storage::has_profile(env, &caller) {
        return Err(ContractError::AlreadyRegistered);
    }

    // Each username must be unique across the platform.
    if storage::get_username_address(env, &username).is_some() {
        return Err(ContractError::UsernameTaken);
    }

    // --- Build and persist the profile ---

    let now = env.ledger().timestamp();
    let profile = Profile {
        owner: caller.clone(),
        username: username.clone(),
        display_name,
        bio,
        website: String::from_str(env, ""),
        image_url,
        social_links: soroban_sdk::Map::new(env),
        x_handle: normalized_x,
        x_followers: 0,
        x_engagement_avg: 0,
        // Base credit score assigned at registration.
        credit_score: 40,
        total_tips_received: 0,
        total_tips_count: 0,
        balance: 0,
        registered_at: now,
        updated_at: now,
        verification: crate::types::VerificationStatus {
            is_verified: false,
            verification_type: crate::types::VerificationType::Unverified,
            verified_at: None,
            revoked_at: None,
        },
    };

    storage::set_profile(env, &profile);
    storage::set_username_address(env, &username, &caller);
    storage::increment_total_creators(env);

    // Bump TTL for both Profile and UsernameToAddress together.
    storage::bump_profile_ttl(env, &caller);
    storage::bump_username_ttl(env, &username);

    // Emit ProfileRegistered event.
    events::emit_profile_registered(env, &caller, &username);

    Ok(profile)
}

pub fn update_profile(
    env: &Env,
    caller: Address,
    display_name: Option<String>,
    bio: Option<String>,
    image_url: Option<String>,
    x_handle: Option<String>,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);

    crate::admin::require_not_paused(env)?;

    caller.require_auth();

    if !storage::has_profile(env, &caller) {
        return Err(ContractError::NotRegistered);
    }

    let mut profile = storage::get_profile(env, &caller);

    if let Some(ref dn) = display_name {
        let len = dn.len();
        if len == 0 || len > 64 {
            return Err(ContractError::InvalidDisplayName);
        }
        profile.display_name = dn.clone();
    }

    if let Some(ref b) = bio {
        if b.len() > 280 {
            return Err(ContractError::MessageTooLong);
        }
        profile.bio = b.clone();
    }

    if let Some(ref url) = image_url {
        if url.len() > 256 {
            return Err(ContractError::InvalidImageUrl);
        }
        profile.image_url = url.clone();
    }

    if let Some(ref handle) = x_handle {
        validation::validate_x_handle(handle)?;

        // Normalize x_handle: prepend @ if missing.
        let mut normalized_x = handle.clone();
        let mut handle_buf = [0u8; 16];
        let n = handle.len() as usize;
        handle.copy_into_slice(&mut handle_buf[..n]);
        if handle_buf[0] != b'@' {
            let mut full_buf = [0u8; 17];
            full_buf[0] = b'@';
            let n = handle.len() as usize;
            handle.copy_into_slice(&mut full_buf[1..1 + n]);
            if let Ok(s) = core::str::from_utf8(&full_buf[..1 + n]) {
                normalized_x = String::from_str(env, s);
            }
        }

        profile.x_handle = normalized_x;
    }

    profile.updated_at = env.ledger().timestamp();

    storage::set_profile(env, &profile);

    // Bump TTL for both Profile and UsernameToAddress together.
    storage::bump_profile_ttl(env, &caller);
    storage::bump_username_ttl(env, &profile.username);

    events::emit_profile_updated(env, &caller);

    Ok(())
}

/// Deregister the caller's profile, permanently removing it from the platform.
///
/// # Requirements
/// - Caller must have a registered profile
/// - Caller's balance must be zero (all tips withdrawn)
/// - Contract must not be paused
///
/// # Effects
/// - Removes profile from persistent storage
/// - Removes username reverse-lookup entry
/// - Removes creator from leaderboard (if present)
/// - Decrements total creators counter
/// - Resets per-creator and per-tipper tip index entries in temporary storage
///   (prevents index collisions on re-registration)
/// - Emits ProfileDeregistered event
///
/// # Errors
/// - [`ContractError::NotRegistered`] - Caller has no profile
/// - [`ContractError::BalanceNotZero`] - Caller has unwithdrawn tips
/// - [`ContractError::ContractPaused`] - Contract is paused
pub fn deregister_profile(env: &Env, caller: Address) -> Result<(), ContractError> {
    // 4.1: Authorization check, extend TTL, and check pause state
    caller.require_auth();
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;

    // 4.2: Profile existence validation
    if !storage::has_profile(env, &caller) {
        return Err(ContractError::NotRegistered);
    }

    // 4.3: Balance validation
    let profile = storage::get_profile(env, &caller);
    if profile.balance > 0 {
        return Err(ContractError::BalanceNotZero);
    }

    // 4.4: Storage cleanup operations
    storage::remove_profile(env, &caller);
    storage::remove_username_address(env, &profile.username);
    storage::decrement_total_creators(env);

    // 4.5: Leaderboard removal
    crate::leaderboard::remove_from_leaderboard(env, &caller);

    // 4.6: Tip index cleanup — reset temporary storage indices so that
    // stale counts cannot cause index collisions on re-registration.
    storage::reset_creator_tip_index(env, &caller);
    storage::reset_tipper_tip_index(env, &caller);

    // 4.7: Event emission
    events::emit_profile_deregistered(env, &caller, &profile.username);

    Ok(())
}


/// Set a custom donation page configuration for a creator
pub fn set_donation_page(
    env: &Env,
    creator: &Address,
    config: crate::types::DonationPageConfig,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    creator.require_auth();

    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    // Validate config
    if config.welcome_message.len() > 500 {
        return Err(ContractError::MessageTooLong);
    }

    if config.suggested_amounts.len() > 6 {
        return Err(ContractError::InvalidAmount);
    }

    if config.header_image_uri.len() > 256 {
        return Err(ContractError::InvalidImageUrl);
    }

    // Validate theme color format (basic check for hex color)
    if config.theme_color.len() > 0 && config.theme_color.len() != 7 {
        return Err(ContractError::InvalidAmount); // Reusing error for invalid format
    }

    storage::set_donation_page(env, creator, &config);
    events::emit_donation_page_updated(env, creator);

    Ok(())
}

/// Get donation page configuration for a creator
pub fn get_donation_page(
    env: &Env,
    creator: &Address,
) -> Result<crate::types::DonationPageConfig, ContractError> {
    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }

    // Return custom config if exists, otherwise return default
    if let Some(config) = storage::get_donation_page(env, creator) {
        Ok(config)
    } else {
        // Return default config
        let mut default_amounts = soroban_sdk::Vec::new(env);
        default_amounts.push_back(5_000_000); // 5 XLM
        default_amounts.push_back(10_000_000); // 10 XLM
        default_amounts.push_back(25_000_000); // 25 XLM
        default_amounts.push_back(50_000_000); // 50 XLM

        Ok(crate::types::DonationPageConfig {
            welcome_message: String::from_str(env, "Support my work!"),
            suggested_amounts: default_amounts,
            theme_color: String::from_str(env, "#3b82f6"),
            header_image_uri: String::from_str(env, ""),
            is_default: true,
        })
    }
}
