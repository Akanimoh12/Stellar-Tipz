//! Input validation helpers for the Tipz contract.
//!
//! Soroban `String` does not expose standard Rust string methods, so all
//! validation is performed by iterating over the raw bytes obtained via
//! [`soroban_sdk::String::copy_into_slice`].

use soroban_sdk::String;

use crate::errors::ContractError;

/// Minimum allowed username length (inclusive).
#[allow(dead_code)]
const USERNAME_MIN_LEN: u32 = 3;
/// Maximum allowed username length (inclusive).
#[allow(dead_code)]
const USERNAME_MAX_LEN: u32 = 32;

/// Validate that a username satisfies the Tipz naming rules.
///
/// # Rules
/// 1. Length must be between 3 and 32 characters (inclusive).
/// 2. Only lowercase ASCII letters (`a-z`), digits (`0-9`), and underscore
///    (`_`) are allowed.
/// 3. Must start with a lowercase letter (`a-z`).
/// 4. Must **not** end with an underscore.
/// 5. Consecutive underscores (`__`) are not allowed.
///
/// # Errors
/// Returns [`ContractError::InvalidUsername`] if any rule is violated.
#[allow(dead_code)]
pub fn validate_username(username: &String) -> Result<(), ContractError> {
    let len = username.len();

    // Rule 1 – length bounds
    if !(USERNAME_MIN_LEN..=USERNAME_MAX_LEN).contains(&len) {
        return Err(ContractError::InvalidUsername);
    }

    // Copy bytes into a fixed-size buffer so we can iterate.
    // 32 == USERNAME_MAX_LEN; length is already validated above.
    let mut buf = [0u8; 32];
    let n = len as usize;
    username.copy_into_slice(&mut buf[..n]);
    let bytes = &buf[..n];

    // Rule 3 – must start with a lowercase letter
    if !bytes[0].is_ascii_lowercase() {
        return Err(ContractError::InvalidUsername);
    }

    // Rule 4 – must not end with underscore
    if bytes[n - 1] == b'_' {
        return Err(ContractError::InvalidUsername);
    }

    // Rules 2 & 5 – allowed characters + no consecutive underscores
    let mut prev_underscore = false;
    for &b in bytes.iter() {
        let is_lower = b.is_ascii_lowercase();
        let is_digit = b.is_ascii_digit();
        let is_underscore = b == b'_';

        // Rule 2 – character allowlist
        if !(is_lower || is_digit || is_underscore) {
            return Err(ContractError::InvalidUsername);
        }

        // Rule 5 – no consecutive underscores
        if is_underscore && prev_underscore {
            return Err(ContractError::InvalidUsername);
        }

        prev_underscore = is_underscore;
    }

    Ok(())
}
