//! Profile registration logic for the Tipz contract.

use soroban_sdk::{Address, Env, String};

use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::Profile;

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
    // Require explicit authorisation from the caller.
    caller.require_auth();

    // Contract must be initialised before profiles can be created.
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }

    // --- Input validation ---

    // Username: 3-32 chars, [a-z0-9_], must start with a letter.
    crate::validation::validate_username(&username)?;

    // Display name: 1-64 characters, non-empty.
    let dn_len = display_name.len();
    if dn_len == 0 || dn_len > 64 {
        return Err(ContractError::InvalidDisplayName);
    }

    // Bio: max 280 characters.
    if bio.len() > 280 {
        return Err(ContractError::MessageTooLong);
    }

    // Image URL: max 256 characters.
    if image_url.len() > 256 {
        return Err(ContractError::InvalidImageUrl);
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
        image_url,
        x_handle,
        x_followers: 0,
        x_engagement_avg: 0,
        // Base credit score assigned at registration.
        credit_score: 40,
        total_tips_received: 0,
        total_tips_count: 0,
        balance: 0,
        registered_at: now,
        updated_at: now,
    };

    storage::set_profile(env, &profile);
    storage::set_username_address(env, &username, &caller);
    storage::increment_total_creators(env);

    // Emit ProfileRegistered event.
    events::emit_profile_registered(env, &caller, &username);

    Ok(profile)
}

/// Update an existing creator profile.
///
/// # Errors
/// - `NotInitialized` if contract is not initialized
/// - `NotRegistered` if caller has no profile
/// - `InvalidDisplayName` if display_name is empty or > 64 when provided
/// - `MessageTooLong` if bio is > 280 when provided
/// - `InvalidImageUrl` if image_url is > 256 when provided
pub fn update_profile(
    env: &Env,
    caller: Address,
    display_name: Option<String>,
    bio: Option<String>,
    image_url: Option<String>,
    x_handle: Option<String>,
) -> Result<(), ContractError> {
    caller.require_auth();

    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }

    if !storage::has_profile(env, &caller) {
        return Err(ContractError::NotRegistered);
    }

    let mut profile = storage::get_profile(env, &caller);

    if let Some(dn) = display_name {
        let dn_len = dn.len();
        if dn_len == 0 || dn_len > 64 {
            return Err(ContractError::InvalidDisplayName);
        }
        profile.display_name = dn;
    }

    if let Some(b) = bio {
        if b.len() > 280 {
            return Err(ContractError::MessageTooLong);
        }
        profile.bio = b;
    }

    if let Some(img) = image_url {
        if img.len() > 256 {
            return Err(ContractError::InvalidImageUrl);
        }
        profile.image_url = img;
    }

    if let Some(xh) = x_handle {
        if xh.len() > 32 {
            return Err(ContractError::InvalidUsername);
        }
        profile.x_handle = xh;
    }

    profile.updated_at = env.ledger().timestamp();
    storage::set_profile(env, &profile);
    events::emit_profile_updated(env, &caller);

    Ok(())
}
