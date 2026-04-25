//! Verification system for creator profiles.

use soroban_sdk::{Address, Env};

use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::{VerificationStatus, VerificationType};

/// Submit a verification request for the caller's profile.
///
/// # Parameters
/// - `caller` – address of the creator requesting verification
/// - `verification_type` – type of verification (Identity, SocialMedia, Community)
///
/// # Returns
/// Unit on success
///
/// # Errors
/// - [`ContractError::NotRegistered`] – caller has no profile
/// - [`ContractError::AlreadyVerified`] – caller is already verified
pub fn request_verification(
    env: &Env,
    caller: Address,
    verification_type: VerificationType,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    caller.require_auth();

    if !storage::has_profile(env, &caller) {
        return Err(ContractError::NotRegistered);
    }

    let profile = storage::get_profile(env, &caller);
    if profile.verification.is_verified {
        return Err(ContractError::AlreadyVerified);
    }

    storage::set_verification_request(env, &caller, &verification_type);
    events::emit_verification_requested(env, &caller, &verification_type);

    Ok(())
}

/// Admin approves a verification request.
///
/// # Parameters
/// - `env` – Soroban environment
/// - `creator` – address of the creator to verify
/// - `verification_type` – type of verification to grant
///
/// # Returns
/// Unit on success
///
/// # Errors
/// - [`ContractError::Unauthorized`] – caller is not admin
/// - [`ContractError::NotRegistered`] – creator has no profile
/// - [`ContractError::AlreadyVerified`] – creator is already verified
pub fn approve_verification(
    env: &Env,
    creator: Address,
    verification_type: VerificationType,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);

    if !storage::has_profile(env, &creator) {
        return Err(ContractError::NotRegistered);
    }

    let mut profile = storage::get_profile(env, &creator);
    if profile.verification.is_verified {
        return Err(ContractError::AlreadyVerified);
    }

    let now = env.ledger().timestamp();
    profile.verification = VerificationStatus {
        is_verified: true,
        verification_type: verification_type.clone(),
        verified_at: Some(now),
        revoked_at: None,
    };

    storage::set_profile(env, &profile);
    storage::remove_verification_request(env, &creator);
    events::emit_verification_approved(env, &creator, &verification_type);

    Ok(())
}

/// Admin revokes a creator's verification.
///
/// # Parameters
/// - `env` – Soroban environment
/// - `creator` – address of the creator to revoke verification from
///
/// # Returns
/// Unit on success
///
/// # Errors
/// - [`ContractError::Unauthorized`] – caller is not admin
/// - [`ContractError::NotRegistered`] – creator has no profile
/// - [`ContractError::NotVerified`] – creator is not verified
pub fn revoke_verification(env: &Env, creator: Address) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);

    if !storage::has_profile(env, &creator) {
        return Err(ContractError::NotRegistered);
    }

    let mut profile = storage::get_profile(env, &creator);
    if !profile.verification.is_verified {
        return Err(ContractError::NotVerified);
    }

    let now = env.ledger().timestamp();
    profile.verification = VerificationStatus {
        is_verified: false,
        verification_type: crate::types::VerificationType::Unverified,
        verified_at: None,
        revoked_at: Some(now),
    };

    storage::set_profile(env, &profile);
    events::emit_verification_revoked(env, &creator);

    Ok(())
}

/// Get verification status for a creator.
pub fn get_verification_status(
    env: &Env,
    creator: Address,
) -> Result<VerificationStatus, ContractError> {
    if !storage::has_profile(env, &creator) {
        return Err(ContractError::NotRegistered);
    }

    let profile = storage::get_profile(env, &creator);
    Ok(profile.verification)
}
