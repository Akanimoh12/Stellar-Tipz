//! Tests for input validation functions.

#![cfg(test)]

use soroban_sdk::{Env, String};

use crate::errors::ContractError;
use crate::validation::{
    validate_bio, validate_display_name, validate_image_url, validate_username,
};

// ───────────────────────── helpers ──────────────────────────

fn s(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

// ═══════════════════════════════════════════════════════════════════════════
// USERNAME VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────── valid usernames ──────────────────────

#[test]
fn valid_simple_username() {
    let env = Env::default();
    assert_eq!(validate_username(&s(&env, "alice")), Ok(()));
}

#[test]
fn valid_min_length() {
    let env = Env::default();
    assert_eq!(validate_username(&s(&env, "abc")), Ok(()));
}

#[test]
fn valid_max_length() {
    let env = Env::default();
    // 32 characters
    assert_eq!(
        validate_username(&s(&env, "abcdefghijklmnopqrstuvwxyz012345")),
        Ok(())
    );
}

#[test]
fn valid_with_digits() {
    let env = Env::default();
    assert_eq!(validate_username(&s(&env, "user123")), Ok(()));
}

#[test]
fn valid_with_underscores() {
    let env = Env::default();
    assert_eq!(validate_username(&s(&env, "hello_world")), Ok(()));
}

#[test]
fn valid_single_underscore_in_middle() {
    let env = Env::default();
    assert_eq!(validate_username(&s(&env, "a_b")), Ok(()));
}

#[test]
fn valid_multiple_separated_underscores() {
    let env = Env::default();
    assert_eq!(validate_username(&s(&env, "a_b_c_d")), Ok(()));
}

#[test]
fn valid_ends_with_digit() {
    let env = Env::default();
    assert_eq!(validate_username(&s(&env, "user42")), Ok(()));
}

// ──────────────── too short / too long ──────────────────────

#[test]
fn reject_too_short_one_char() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "a")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_too_short_two_chars() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "ab")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_too_long() {
    let env = Env::default();
    // 33 characters
    assert_eq!(
        validate_username(&s(&env, "abcdefghijklmnopqrstuvwxyz0123456")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_empty() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "")),
        Err(ContractError::InvalidUsername)
    );
}

// ──────────────── start character rules ─────────────────────

#[test]
fn reject_starts_with_digit() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "1alice")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_starts_with_underscore() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "_alice")),
        Err(ContractError::InvalidUsername)
    );
}

// ──────────────── end character rules ───────────────────────

#[test]
fn reject_ends_with_underscore() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "alice_")),
        Err(ContractError::InvalidUsername)
    );
}

// ──────────── consecutive underscores ───────────────────────

#[test]
fn reject_consecutive_underscores() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "alice__bob")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_triple_underscores() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "a___b")),
        Err(ContractError::InvalidUsername)
    );
}

// ──────────── disallowed characters ─────────────────────────

#[test]
fn reject_uppercase() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "Alice")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_uppercase_middle() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "aLice")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_space() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "ali ce")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_hyphen() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "ali-ce")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_dot() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "ali.ce")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_at_sign() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "ali@ce")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_special_chars() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "ali$ce")),
        Err(ContractError::InvalidUsername)
    );
}

// ──────────── boundary / edge cases ─────────────────────────

#[test]
fn valid_exactly_three_letters() {
    let env = Env::default();
    assert_eq!(validate_username(&s(&env, "abc")), Ok(()));
}

#[test]
fn valid_letter_digit_letter() {
    let env = Env::default();
    assert_eq!(validate_username(&s(&env, "a1b")), Ok(()));
}

#[test]
fn reject_all_underscores() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "___")),
        Err(ContractError::InvalidUsername)
    );
}

#[test]
fn reject_all_digits() {
    let env = Env::default();
    assert_eq!(
        validate_username(&s(&env, "123")),
        Err(ContractError::InvalidUsername)
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPLAY NAME VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn display_name_valid_simple() {
    let env = Env::default();
    assert_eq!(validate_display_name(&s(&env, "Alice")), Ok(()));
}

#[test]
fn display_name_valid_with_spaces() {
    let env = Env::default();
    assert_eq!(validate_display_name(&s(&env, "Alice Smith")), Ok(()));
}

#[test]
fn display_name_valid_min_length() {
    let env = Env::default();
    assert_eq!(validate_display_name(&s(&env, "A")), Ok(()));
}

#[test]
fn display_name_valid_max_length() {
    let env = Env::default();
    // 64 characters
    let name = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901";
    assert_eq!(name.len(), 64);
    assert_eq!(validate_display_name(&s(&env, name)), Ok(()));
}

#[test]
fn display_name_valid_with_special_chars() {
    let env = Env::default();
    assert_eq!(validate_display_name(&s(&env, "Alice @crypto")), Ok(()));
}

#[test]
fn display_name_reject_empty() {
    let env = Env::default();
    assert_eq!(
        validate_display_name(&s(&env, "")),
        Err(ContractError::InvalidDisplayName)
    );
}

#[test]
fn display_name_reject_too_long() {
    let env = Env::default();
    // 65 characters
    let name = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789012";
    assert_eq!(name.len(), 65);
    assert_eq!(
        validate_display_name(&s(&env, name)),
        Err(ContractError::InvalidDisplayName)
    );
}

#[test]
fn display_name_reject_whitespace_only_space() {
    let env = Env::default();
    assert_eq!(
        validate_display_name(&s(&env, "   ")),
        Err(ContractError::InvalidDisplayName)
    );
}

#[test]
fn display_name_reject_whitespace_only_tab() {
    let env = Env::default();
    assert_eq!(
        validate_display_name(&s(&env, "\t\t")),
        Err(ContractError::InvalidDisplayName)
    );
}

#[test]
fn display_name_reject_whitespace_only_newline() {
    let env = Env::default();
    assert_eq!(
        validate_display_name(&s(&env, "\n\n")),
        Err(ContractError::InvalidDisplayName)
    );
}

#[test]
fn display_name_valid_with_leading_space() {
    let env = Env::default();
    assert_eq!(validate_display_name(&s(&env, " Alice")), Ok(()));
}

#[test]
fn display_name_valid_with_trailing_space() {
    let env = Env::default();
    assert_eq!(validate_display_name(&s(&env, "Alice ")), Ok(()));
}

// ═══════════════════════════════════════════════════════════════════════════
// BIO VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn bio_valid_empty() {
    let env = Env::default();
    assert_eq!(validate_bio(&s(&env, "")), Ok(()));
}

#[test]
fn bio_valid_short() {
    let env = Env::default();
    assert_eq!(validate_bio(&s(&env, "Web3 developer")), Ok(()));
}

#[test]
fn bio_valid_max_length() {
    let env = Env::default();
    // 280 characters
    let bio = "a".repeat(280);
    assert_eq!(validate_bio(&s(&env, &bio)), Ok(()));
}

#[test]
fn bio_reject_too_long() {
    let env = Env::default();
    // 281 characters
    let bio = "a".repeat(281);
    assert_eq!(
        validate_bio(&s(&env, &bio)),
        Err(ContractError::MessageTooLong)
    );
}

#[test]
fn bio_valid_with_special_chars() {
    let env = Env::default();
    assert_eq!(
        validate_bio(&s(&env, "Building cool stuff! Check out @myproject")),
        Ok(())
    );
}

#[test]
fn bio_valid_with_newlines() {
    let env = Env::default();
    assert_eq!(validate_bio(&s(&env, "Line 1\nLine 2\nLine 3")), Ok(()));
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE URL VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn image_url_valid_empty() {
    let env = Env::default();
    assert_eq!(validate_image_url(&s(&env, "")), Ok(()));
}

#[test]
fn image_url_valid_https() {
    let env = Env::default();
    assert_eq!(
        validate_image_url(&s(&env, "https://example.com/image.png")),
        Ok(())
    );
}

#[test]
fn image_url_valid_ipfs() {
    let env = Env::default();
    assert_eq!(
        validate_image_url(&s(
            &env,
            "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
        )),
        Ok(())
    );
}

#[test]
fn image_url_valid_max_length() {
    let env = Env::default();
    // 256 characters
    let url = "a".repeat(256);
    assert_eq!(validate_image_url(&s(&env, &url)), Ok(()));
}

#[test]
fn image_url_reject_too_long() {
    let env = Env::default();
    // 257 characters
    let url = "a".repeat(257);
    assert_eq!(
        validate_image_url(&s(&env, &url)),
        Err(ContractError::InvalidImageUrl)
    );
}

#[test]
fn image_url_valid_data_uri() {
    let env = Env::default();
    assert_eq!(
        validate_image_url(&s(&env, "data:image/png;base64,iVBORw0KGgoAAAANS")),
        Ok(())
    );
}
