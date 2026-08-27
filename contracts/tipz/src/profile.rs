//! Profile registration and update logic for the Tipz contract.

use soroban_sdk::{Address, Env, String, Vec};

use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::{Profile, ProfileWithDeactivation, MAX_DISPLAY_NAME_LENGTH, MAX_BIO_LENGTH, INACTIVE_PROFILE_THRESHOLD_SECS};
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

    if storage::is_paused(env, crate::types::PauseFlag::Registration) || storage::is_paused(env, crate::types::PauseFlag::All) {
        return Err(ContractError::ContractPaused);
    }

    // Require explicit authorisation from the caller.
    caller.require_auth();

    // Contract must be initialised before profiles can be created.
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }

    // --- DoS protection: max profiles ---

    validation::validate_profile_count(env)?;

    // --- Input validation (centralized in validation module) ---

    validation::validate_username(&username)?;
    validation::validate_display_name(&display_name)?;
    validation::validate_bio(&bio)?;
    validation::validate_image_url(&image_url)?;
    // x_handle is optional: only validate and normalize if non-empty.
    let normalized_x = if !x_handle.is_empty() {
        validation::validate_x_handle(&x_handle)?;
        // Normalize: prepend @ if missing.
        let mut handle_buf = [0u8; 16];
        let n = x_handle.len() as usize;
        x_handle.copy_into_slice(&mut handle_buf[..n]);
        if handle_buf[0] != b'@' {
            let mut full_buf = [0u8; 17];
            full_buf[0] = b'@';
            x_handle.copy_into_slice(&mut full_buf[1..1 + n]);
            // SAFETY: x_handle is validated to be alphanumeric/underscore ASCII.
            if let Ok(s) = core::str::from_utf8(&full_buf[..1 + n]) {
                String::from_str(env, s)
            } else {
                x_handle.clone()
            }
        } else {
            x_handle.clone()
        }
    } else {
        x_handle.clone()
    };

    // --- Duplicate checks ---

    // Each address may only register once.
    if storage::has_profile(env, &caller) {
        return Err(ContractError::AlreadyRegistered);
    }

    // Each username must be unique across the platform.
    if storage::get_username_address(env, &username).is_some() {
        return Err(ContractError::UsernameTaken);
    }

    // --- Registration rate limiting (must come AFTER duplicate checks so the
    // counter increment is committed — Soroban rolls back storage on Err) ---

    validation::validate_registration_rate_limit(env, &caller)?;

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
        domain: String::from_str(env, ""),
        domain_verified: false,
        domain_verified_at: None,
        custom_min_tip: None,
        last_active_at: now,  // newly registered creators are "active" at registration
    };

    storage::set_profile(env, &profile);
    storage::set_username_address(env, &username, &caller);
    storage::increment_total_creators(env);
    // Maintain a dense creator index for bounded paginated iteration (#1185).
    storage::append_creator_to_index(env, &caller);

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
        if len == 0 || len > MAX_DISPLAY_NAME_LENGTH {
            return Err(ContractError::InvalidDisplayName);
        }
        profile.display_name = dn.clone();
    }

    if let Some(ref b) = bio {
        if b.len() > MAX_BIO_LENGTH {
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

/// Update social links for a profile with limit enforcement (max 5 links).
pub fn update_social_links(
    env: &Env,
    caller: Address,
    social_links: soroban_sdk::Map<soroban_sdk::Symbol, String>,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);

    if storage::is_paused(env, crate::types::PauseFlag::Registration) || storage::is_paused(env, crate::types::PauseFlag::All) {
        return Err(ContractError::ContractPaused);
    }

    caller.require_auth();

    if !storage::has_profile(env, &caller) {
        return Err(ContractError::NotRegistered);
    }

    // Enforce max social links limit
    if social_links.len() > crate::types::MAX_SOCIAL_LINKS {
        return Err(ContractError::StorageLimitExceeded);
    }

    let mut profile = storage::get_profile(env, &caller);
    profile.social_links = social_links;
    profile.updated_at = env.ledger().timestamp();

    storage::set_profile(env, &profile);

    // Bump TTL for both Profile and UsernameToAddress together.
    storage::bump_profile_ttl(env, &caller);
    storage::bump_username_ttl(env, &profile.username);

    events::emit_profile_updated(env, &caller);

    Ok(())
}

/// Load profile plus deactivation flags for read-only queries.
pub fn get_profile_with_deactivation(
    env: &Env,
    address: &Address,
) -> Result<ProfileWithDeactivation, ContractError> {
    refresh_domain_verification_status(env, address);
    let profile = storage::get_profile_opt(env, address).ok_or(ContractError::NotRegistered)?;
    storage::bump_existing_profile_ttl(env, address);
    storage::bump_username_ttl(env, &profile.username);
    let deactivated_at = storage::get_profile_deactivated_at(env, address);
    let is_deactivated = deactivated_at.is_some();
    Ok(ProfileWithDeactivation {
        profile,
        is_deactivated,
        deactivated_at,
    })
}

/// Temporarily deactivate a creator profile (self or admin moderation).
///
/// Removes the creator from the leaderboard and blocks new tips. Data and balance stay on-chain.
pub fn deactivate_profile(
    env: &Env,
    caller: Address,
    creator: Address,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;

    if !storage::has_profile(env, &creator) {
        return Err(ContractError::NotRegistered);
    }

    if caller == creator {
        caller.require_auth();
    } else {
        crate::admin::require_admin(env, &caller)?;
    }

    if storage::is_profile_deactivated(env, &creator) {
        return Err(ContractError::ProfileDeactivated);
    }

    let now = env.ledger().timestamp();
    storage::set_profile_deactivated_at(env, &creator, now);
    crate::leaderboard::remove_from_all_leaderboards(env, &creator);

    let username = storage::get_profile(env, &creator).username.clone();
    storage::bump_profile_ttl(env, &creator);
    storage::bump_username_ttl(env, &username);

    events::emit_profile_deactivated(env, &creator, &caller);
    if caller != creator {
        crate::admin::log_admin_action(
            env,
            &caller,
            soroban_sdk::Symbol::new(env, "deactivate_profile"),
            soroban_sdk::String::from_str(env, "active"),
            soroban_sdk::String::from_str(env, "deactivated"),
        );
    }
    Ok(())
}

/// Restore a deactivated profile (owner or admin).
pub fn reactivate_profile(
    env: &Env,
    caller: Address,
    creator: Address,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;

    if !storage::has_profile(env, &creator) {
        return Err(ContractError::NotRegistered);
    }

    if caller == creator {
        caller.require_auth();
    } else {
        crate::admin::require_admin(env, &caller)?;
    }

    if !storage::is_profile_deactivated(env, &creator) {
        return Err(ContractError::ProfileNotDeactivated);
    }

    storage::clear_profile_deactivation(env, &creator);
    let profile = storage::get_profile(env, &creator);
    crate::leaderboard::update_all_leaderboards(env, &profile, 0);

    storage::bump_profile_ttl(env, &creator);
    storage::bump_username_ttl(env, &profile.username);

    events::emit_profile_reactivated(env, &creator, &caller);
    if caller != creator {
        crate::admin::log_admin_action(
            env,
            &caller,
            soroban_sdk::Symbol::new(env, "reactivate_profile"),
            soroban_sdk::String::from_str(env, "deactivated"),
            soroban_sdk::String::from_str(env, "active"),
        );
    }
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

    storage::clear_profile_deactivation(env, &caller);

    // 4.4: Storage cleanup operations
    storage::remove_profile(env, &caller);
    storage::remove_username_address(env, &profile.username);
    storage::decrement_total_creators(env);

    // 4.5: Leaderboard removal
    crate::leaderboard::remove_from_all_leaderboards(env, &caller);

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

    if config.suggested_amounts.len() > crate::types::MAX_SUGGESTED_AMOUNTS {
        return Err(ContractError::StorageLimitExceeded);
    }

    if config.header_image_uri.len() > 256 {
        return Err(ContractError::InvalidImageUrl);
    }

    // Validate theme color format (basic check for hex color)
    if !config.theme_color.is_empty() && config.theme_color.len() != 7 {
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

/// Set a custom minimum tip amount for the caller's profile.
///
/// Pass `0` to reset to the global minimum.
pub fn set_min_tip(
    env: &Env,
    creator: Address,
    min_amount: i128,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    creator.require_auth();

    if !storage::has_profile(env, &creator) {
        return Err(ContractError::NotRegistered);
    }

    if min_amount == 0 {
        let mut profile = storage::get_profile(env, &creator);
        profile.custom_min_tip = None;
        profile.updated_at = env.ledger().timestamp();
        storage::set_profile(env, &profile);
        storage::bump_profile_ttl(env, &creator);
        storage::bump_username_ttl(env, &profile.username);
        events::emit_creator_min_tip_updated(env, &creator, None);
        return Ok(());
    }

    if min_amount < 0 {
        return Err(ContractError::InvalidAmount);
    }

    let mut profile = storage::get_profile(env, &creator);
    profile.custom_min_tip = Some(min_amount);
    profile.updated_at = env.ledger().timestamp();
    storage::set_profile(env, &profile);
    storage::bump_profile_ttl(env, &creator);
    storage::bump_username_ttl(env, &profile.username);
    events::emit_creator_min_tip_updated(env, &creator, Some(min_amount));
    Ok(())
}

/// Return the effective minimum tip amount for a creator.
pub fn get_creator_min_tip(env: &Env, creator: &Address) -> Result<i128, ContractError> {
    if !storage::has_profile(env, creator) {
        return Err(ContractError::NotRegistered);
    }
    Ok(storage::get_effective_creator_min_tip(env, creator))
}

/// Set the domain to verify via stellar.toml (marks verification as pending).
pub fn set_domain(env: &Env, creator: Address, domain: String) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    creator.require_auth();

    if !storage::has_profile(env, &creator) {
        return Err(ContractError::NotRegistered);
    }

    validation::validate_domain(&domain)?;

    let mut profile = storage::get_profile(env, &creator);
    profile.domain = domain.clone();
    profile.domain_verified = false;
    profile.domain_verified_at = None;
    profile.updated_at = env.ledger().timestamp();

    storage::set_profile(env, &profile);
    storage::bump_profile_ttl(env, &creator);
    storage::bump_username_ttl(env, &profile.username);

    events::emit_domain_set(env, &creator, &domain);
    Ok(())
}

/// Invalidate domain verification when the re-verification interval has elapsed.
pub fn refresh_domain_verification_status(env: &Env, creator: &Address) {
    if !storage::has_profile(env, creator) {
        return;
    }

    let mut profile = storage::get_profile(env, creator);
    if !profile.domain_verified {
        return;
    }

    let Some(verified_at) = profile.domain_verified_at else {
        return;
    };

    let interval = storage::get_domain_reverification_interval(env);
    let now = env.ledger().timestamp();
    if now <= verified_at.saturating_add(interval) {
        return;
    }

    profile.domain_verified = false;
    profile.domain_verified_at = None;
    profile.verification = crate::types::VerificationStatus {
        is_verified: false,
        verification_type: crate::types::VerificationType::Unverified,
        verified_at: None,
        revoked_at: Some(now),
    };
    profile.updated_at = now;
    storage::set_profile(env, &profile);
    events::emit_domain_verification_expired(env, creator);
}

/// Check whether a profile is eligible for cleanup based on inactivity.
///
/// Returns `true` if the profile has been inactive beyond
/// [`INACTIVE_PROFILE_THRESHOLD_SECS`] and has a zero balance.
pub fn is_profile_inactive_eligible(env: &Env, address: &Address) -> bool {
    let now = env.ledger().timestamp();
    let last_active = storage::get_creator_last_active(env, address);

    // Profile must never have been active (registered but no tips received)
    // or inactive beyond the threshold
    if last_active == 0 {
        // Check registration time instead
        if let Some(profile) = storage::get_profile_opt(env, address) {
            if now >= profile.registered_at.saturating_add(INACTIVE_PROFILE_THRESHOLD_SECS) {
                return profile.balance == 0;
            }
        }
        return false;
    }

    let is_inactive = now >= last_active.saturating_add(INACTIVE_PROFILE_THRESHOLD_SECS);

    // Only eligible if balance is zero (no funds to lose)
    if is_inactive {
        if let Some(profile) = storage::get_profile_opt(env, address) {
            return profile.balance == 0;
        }
    }

    false
}

/// Cleanup an inactive profile (admin only).
///
/// Removes the profile and associated data from storage. Only profiles that
/// have been inactive beyond [`INACTIVE_PROFILE_THRESHOLD_SECS`] and have a
/// zero balance are eligible. This prevents storage bloat from abandoned profiles.
///
/// # Requirements
/// - Caller must be the admin
/// - Profile must be inactive beyond the threshold
/// - Profile balance must be zero
///
/// # Returns
/// The cleaned up profile's username on success.
///
/// # Errors
/// - [`ContractError::NotRegistered`] if the address has no profile
/// - [`ContractError::ProfileInactive`] if the profile is still active
/// - [`ContractError::BalanceNotZero`] if the profile has unwithdrawn funds
pub fn cleanup_inactive_profile(
    env: &Env,
    admin: Address,
    target: Address,
) -> Result<String, ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, &admin)?;

    if !storage::has_profile(env, &target) {
        return Err(ContractError::NotRegistered);
    }

    if !is_profile_inactive_eligible(env, &target) {
        return Err(ContractError::ProfileNotDeactivated);
    }

    let profile = storage::get_profile(env, &target);
    let username = profile.username.clone();

    // Cleanup all associated data
    storage::clear_profile_deactivation(env, &target);
    storage::remove_profile(env, &target);
    storage::remove_username_address(env, &username);
    storage::decrement_total_creators(env);
    crate::leaderboard::remove_from_all_leaderboards(env, &target);
    storage::reset_creator_tip_index(env, &target);
    storage::reset_tipper_tip_index(env, &target);

    events::emit_profile_deregistered(env, &target, &username);

    crate::admin::log_admin_action(
        env,
        &admin,
        soroban_sdk::Symbol::new(env, "cleanup_profile"),
        soroban_sdk::String::from_str(env, "inactive"),
        username.clone(),
    );

    Ok(username)
}

/// Batch cleanup of inactive profiles (admin only).
///
/// Iterates over a provided list of addresses and removes those that meet
/// inactivity criteria. Skips active profiles and those with balances.
///
/// # Parameters
/// - `admin` - must be the contract admin
/// - `targets` - list of addresses to check and potentially clean up
/// - `max_cleanup` - maximum number of profiles to remove in one call (capped at 20)
///
/// # Returns
/// Number of profiles actually cleaned up.
pub fn cleanup_inactive_profiles(
    env: &Env,
    admin: Address,
    targets: Vec<Address>,
    max_cleanup: u32,
) -> Result<u32, ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, &admin)?;

    let cap = if max_cleanup > 20 { 20 } else { max_cleanup };
    let mut cleaned: u32 = 0;

    for i in 0..targets.len() {
        if cleaned >= cap {
            break;
        }
        let target = targets.get(i).unwrap();
        if cleanup_inactive_profile(env, admin.clone(), target).is_ok() {
            cleaned += 1;
        }
    }

    Ok(cleaned)
}
