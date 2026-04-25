//! Input validation helpers for the Tipz contract.
//!
//! Soroban `String` does not expose standard Rust string methods, so all
//! validation is performed by iterating over the raw bytes obtained via
//! [`soroban_sdk::String::copy_into_slice`].
//!
//! All validators in this module handle ASCII input safely. Multi-byte UTF-8
//! sequences are rejected by the character allowlists where applicable.

use soroban_sdk::String;

use crate::errors::ContractError;

/// Minimum allowed username length in bytes (inclusive).
const USERNAME_MIN_LEN: u32 = 3;
/// Maximum allowed username length in bytes (inclusive).
const USERNAME_MAX_LEN: u32 = 32;

/// Maximum allowed display name length in bytes.
const DISPLAY_NAME_MAX_LEN: u32 = 64;

/// Maximum allowed bio length in bytes.
const BIO_MAX_LEN: u32 = 280;

/// Maximum allowed image URL length in bytes.
const IMAGE_URL_MAX_LEN: u32 = 256;

/// Maximum allowed X (Twitter) handle length in bytes (including optional @).
const X_HANDLE_MAX_LEN: u32 = 16;

/// Maximum allowed tip message length in bytes.
const TIP_MESSAGE_MAX_LEN: u32 = 280;

/// Validates a username against Tipz naming rules.
///
/// Usernames serve as unique identifiers for creator profiles. They appear
/// in URLs and are used for tipping lookups, so strict validation ensures
/// consistency and prevents ambiguity.
///
/// # Rules
///
/// 1. **Length**: Must be between 3 and 32 bytes (inclusive). This range
///    balances readability with flexibility. Since only ASCII characters
///    are allowed, byte length equals character count.
///
/// 2. **Character set**: Only lowercase ASCII letters (`a-z`), ASCII digits
///    (`0-9`), and underscore (`_`) are permitted. Uppercase letters, spaces,
///    hyphens, and other special characters are rejected. Multi-byte UTF-8
///    sequences are inherently rejected since they fall outside the ASCII range.
///
/// 3. **Start character**: Must begin with a lowercase letter (`a-z`).
///    Starting with a digit or underscore is not allowed. This ensures
///    usernames are distinguishable from numeric IDs.
///
/// 4. **End character**: Must not end with an underscore. This prevents
///    trailing underscores that could cause display issues or confusion.
///
/// 5. **No consecutive underscores**: Two or more adjacent underscores (`__`)
///    are not allowed. This keeps usernames clean and prevents visual ambiguity.
///
/// # Implementation Notes
///
/// Validation is performed by copying the string's raw bytes into a stack
/// buffer using [`String::copy_into_slice`], then iterating over each byte.
/// The buffer size is fixed at 32 bytes (the maximum username length).
///
/// # Errors
///
/// Returns [`ContractError::InvalidUsername`] if any rule is violated.
///
/// # Examples
///
/// Valid usernames:
/// - `alice` (simple lowercase)
/// - `user123` (with digits)
/// - `hello_world` (with underscore)
/// - `a_b_c` (multiple separated underscores)
///
/// Invalid usernames:
/// - `ab` (too short)
/// - `Alice` (contains uppercase)
/// - `_user` (starts with underscore)
/// - `user_` (ends with underscore)
/// - `user__name` (consecutive underscores)
pub fn validate_username(username: &String) -> Result<(), ContractError> {
    let len = username.len();

    // Rule 1: Length must be 3-32 bytes
    if !(USERNAME_MIN_LEN..=USERNAME_MAX_LEN).contains(&len) {
        return Err(ContractError::InvalidUsername);
    }

    // Copy bytes into a fixed-size buffer for iteration.
    // Buffer size matches USERNAME_MAX_LEN; length is validated above.
    let mut buf = [0u8; 32];
    let n = len as usize;
    username.copy_into_slice(&mut buf[..n]);
    let bytes = &buf[..n];

    // Rule 3: Must start with a lowercase letter
    if !bytes[0].is_ascii_lowercase() {
        return Err(ContractError::InvalidUsername);
    }

    // Rule 4: Must not end with underscore
    if bytes[n - 1] == b'_' {
        return Err(ContractError::InvalidUsername);
    }

    // Rules 2 & 5: Check character set and no consecutive underscores
    let mut prev_underscore = false;
    for &b in bytes.iter() {
        let is_lower = b.is_ascii_lowercase();
        let is_digit = b.is_ascii_digit();
        let is_underscore = b == b'_';

        // Rule 2: Only [a-z0-9_] allowed
        if !(is_lower || is_digit || is_underscore) {
            return Err(ContractError::InvalidUsername);
        }

        // Rule 5: No consecutive underscores
        if is_underscore && prev_underscore {
            return Err(ContractError::InvalidUsername);
        }

        prev_underscore = is_underscore;
    }

    Ok(())
}

/// Validates a display name for profile registration.
///
/// Display names are shown in the UI and can contain any characters. They
/// provide a human-readable label for the profile.
///
/// # Rules
///
/// 1. **Length**: Must be between 1 and 64 bytes (inclusive).
/// 2. **Content**: Must not be empty or consist only of whitespace after trimming.
///
/// # Implementation Notes
///
/// Whitespace trimming is performed by scanning from both ends of the byte
/// buffer to find the first and last non-whitespace characters. Whitespace
/// is defined as ASCII space (0x20), tab (0x09), newline (0x0A), and
/// carriage return (0x0D).
///
/// # Errors
///
/// Returns [`ContractError::InvalidDisplayName`] if the name is empty,
/// exceeds 64 bytes, or contains only whitespace.
pub fn validate_display_name(display_name: &String) -> Result<(), ContractError> {
    let len = display_name.len();

    if len == 0 || len > DISPLAY_NAME_MAX_LEN {
        return Err(ContractError::InvalidDisplayName);
    }

    // Copy bytes to check for whitespace-only content
    let mut buf = [0u8; 64];
    let n = len as usize;
    display_name.copy_into_slice(&mut buf[..n]);
    let bytes = &buf[..n];

    // Find first non-whitespace character
    let trimmed_start = bytes
        .iter()
        .position(|&b| !matches!(b, b' ' | b'\t' | b'\n' | b'\r'));

    // If no non-whitespace found, the string is empty after trim
    if trimmed_start.is_none() {
        return Err(ContractError::InvalidDisplayName);
    }

    Ok(())
}

/// Validates a bio (biography) for profile registration.
///
/// Bios provide additional context about a creator. They are optional and
/// can be empty.
///
/// # Rules
///
/// 1. **Length**: Must not exceed 280 bytes. This limit matches common
///    short-form text constraints.
/// 2. **Content**: An empty bio is valid.
///
/// # Errors
///
/// Returns [`ContractError::MessageTooLong`] if the bio exceeds 280 bytes.
pub fn validate_bio(bio: &String) -> Result<(), ContractError> {
    if bio.len() > BIO_MAX_LEN {
        return Err(ContractError::MessageTooLong);
    }

    Ok(())
}

/// Validates an image URL for profile registration.
///
/// Image URLs point to profile pictures and can be standard HTTP(S) URLs
/// or IPFS CIDs. Full URL validation is not performed; only length is checked.
///
/// # Rules
///
/// 1. **Length**: Must not exceed 256 bytes.
/// 2. **Content**: An empty URL is valid (profile without image).
///
/// # Implementation Notes
///
/// This validator intentionally does not perform full URL parsing or format
/// validation. URL schemes and structures vary (HTTP, HTTPS, IPFS, data URIs),
/// and strict validation could reject legitimate URLs. Frontend applications
/// should perform additional validation as needed.
///
/// # Errors
///
/// Returns [`ContractError::InvalidImageUrl`] if the URL exceeds 256 bytes.
pub fn validate_image_url(image_url: &String) -> Result<(), ContractError> {
    if image_url.len() > IMAGE_URL_MAX_LEN {
        return Err(ContractError::InvalidImageUrl);
    }

    Ok(())
}

/// Validates an X (Twitter) handle.
///
/// X handles are used for social verification and profile display.
///
/// # Rules
///
/// 1. **Length**: Must be between 1 and 16 bytes (inclusive).
/// 2. **Format**: Must match `@?[a-zA-Z0-9_]{1,15}`.
///    - Optional leading `@` sign.
///    - Remainder must be 1-15 alphanumeric characters or underscores.
///
/// # Implementation Notes
///
/// This validator checks for the optional `@` prefix and then validates that
/// the rest of the string contains only allowed characters and follows the
/// length constraints.
///
/// # Errors
///
/// Returns [`ContractError::InvalidXHandle`] if the handle is empty, too long,
/// or contains invalid characters.
pub fn validate_x_handle(x_handle: &String) -> Result<(), ContractError> {
    let len = x_handle.len();

    if len == 0 || len > X_HANDLE_MAX_LEN {
        return Err(ContractError::InvalidXHandle);
    }

    let mut buf = [0u8; 16];
    let n = len as usize;
    x_handle.copy_into_slice(&mut buf[..n]);
    let bytes = &buf[..n];

    let mut start_idx = 0;
    if bytes[0] == b'@' {
        start_idx = 1;
        // If it's just "@", it's invalid.
        if len == 1 {
            return Err(ContractError::InvalidXHandle);
        }
    }

    // The handle part (excluding optional @) must be 1-15 characters.
    if (len - start_idx) > 15 {
        return Err(ContractError::InvalidXHandle);
    }

    for &b in bytes[(start_idx as usize)..].iter() {
        let is_upper = b.is_ascii_uppercase();
        let is_lower = b.is_ascii_lowercase();
        let is_digit = b.is_ascii_digit();
        let is_underscore = b == b'_';

        if !(is_upper || is_lower || is_digit || is_underscore) {
            return Err(ContractError::InvalidXHandle);
        }
    }

    Ok(())
}

/// Validates a tip amount against positivity and the configured minimum.
pub fn validate_tip_amount(amount: i128, min_tip: i128) -> Result<(), ContractError> {
    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    if amount < min_tip {
        return Err(ContractError::TipBelowMinimum);
    }

    Ok(())
}

/// Validates optional message content attached to a tip.
pub fn validate_message(message: &String) -> Result<(), ContractError> {
    if message.len() > TIP_MESSAGE_MAX_LEN {
        return Err(ContractError::MessageTooLong);
    }

    Ok(())
}
