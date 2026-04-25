//! Property-based tests for contract input validation edge cases.

#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::{Env, String as SorobanString};

use crate::errors::ContractError;
use crate::validation::{
    validate_bio, validate_display_name, validate_image_url, validate_message, validate_tip_amount,
    validate_username, validate_x_handle,
};

fn s(env: &Env, value: &str) -> SorobanString {
    SorobanString::from_str(env, value)
}

fn bytes(env: &Env, value: &[u8]) -> SorobanString {
    SorobanString::from_bytes(env, value)
}

fn expected_username_result(input: &[u8]) -> Result<(), ContractError> {
    if input.len() < 3 || input.len() > 32 {
        return Err(ContractError::InvalidUsername);
    }

    if !input[0].is_ascii_lowercase() || input[input.len() - 1] == b'_' {
        return Err(ContractError::InvalidUsername);
    }

    let mut prev_underscore = false;
    for &b in input {
        let valid = b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_';
        if !valid || (b == b'_' && prev_underscore) {
            return Err(ContractError::InvalidUsername);
        }
        prev_underscore = b == b'_';
    }

    Ok(())
}

fn expected_x_handle_result(input: &[u8]) -> Result<(), ContractError> {
    if input.is_empty() || input.len() > 16 {
        return Err(ContractError::InvalidXHandle);
    }

    let start = if input[0] == b'@' {
        if input.len() == 1 {
            return Err(ContractError::InvalidXHandle);
        }
        1
    } else {
        0
    };

    if input.len() - start > 15 {
        return Err(ContractError::InvalidXHandle);
    }

    for &b in &input[start..] {
        let valid = b.is_ascii_alphanumeric() || b == b'_';
        if !valid {
            return Err(ContractError::InvalidXHandle);
        }
    }

    Ok(())
}

proptest! {
    #[test]
    fn fuzz_username_validation(username in ".*") {
        let env = Env::default();
        let username = s(&env, &username);
        let result = validate_username(&username);

        prop_assert!(matches!(result, Ok(()) | Err(ContractError::InvalidUsername)));
    }

    #[test]
    fn fuzz_username_validation_with_arbitrary_bytes(username in prop::collection::vec(any::<u8>(), 0..=96)) {
        let env = Env::default();
        let result = validate_username(&bytes(&env, &username));

        prop_assert_eq!(result, expected_username_result(&username));
    }

    #[test]
    fn fuzz_tip_amount(amount in any::<i128>(), min_tip in 0_i128..=1_000_000_000_i128) {
        let result = validate_tip_amount(amount, min_tip);

        let expected = if amount <= 0 {
            Err(ContractError::InvalidAmount)
        } else if amount < min_tip {
            Err(ContractError::TipBelowMinimum)
        } else {
            Ok(())
        };
        prop_assert_eq!(result, expected);
    }

    #[test]
    fn fuzz_message_content(message in ".*") {
        let env = Env::default();
        let message = s(&env, &message);
        let result = validate_message(&message);

        prop_assert!(matches!(result, Ok(()) | Err(ContractError::MessageTooLong)));
    }

    #[test]
    fn fuzz_message_content_with_arbitrary_bytes(message in prop::collection::vec(any::<u8>(), 0..=384)) {
        let env = Env::default();
        let result = validate_message(&bytes(&env, &message));

        if message.len() > 280 {
            prop_assert_eq!(result, Err(ContractError::MessageTooLong));
        } else {
            prop_assert_eq!(result, Ok(()));
        }
    }

    #[test]
    fn fuzz_profile_display_name(display_name in prop::collection::vec(any::<u8>(), 0..=96)) {
        let env = Env::default();
        let result = validate_display_name(&bytes(&env, &display_name));

        let has_non_ascii_whitespace = display_name
            .iter()
            .any(|&b| !matches!(b, b' ' | b'\t' | b'\n' | b'\r'));
        let expected = if display_name.is_empty() || display_name.len() > 64 || !has_non_ascii_whitespace {
            Err(ContractError::InvalidDisplayName)
        } else {
            Ok(())
        };
        prop_assert_eq!(result, expected);
    }

    #[test]
    fn fuzz_profile_x_handle(x_handle in prop::collection::vec(any::<u8>(), 0..=64)) {
        let env = Env::default();
        let result = validate_x_handle(&bytes(&env, &x_handle));

        prop_assert_eq!(result, expected_x_handle_result(&x_handle));
    }

    #[test]
    fn fuzz_profile_bio_and_image_url_fields(
        bio in prop::collection::vec(any::<u8>(), 0..=384),
        image_url in prop::collection::vec(any::<u8>(), 0..=320),
    ) {
        let env = Env::default();
        let bio_result = validate_bio(&bytes(&env, &bio));
        let image_result = validate_image_url(&bytes(&env, &image_url));

        prop_assert_eq!(
            bio_result,
            if bio.len() > 280 { Err(ContractError::MessageTooLong) } else { Ok(()) },
        );
        prop_assert_eq!(
            image_result,
            if image_url.len() > 256 { Err(ContractError::InvalidImageUrl) } else { Ok(()) },
        );
    }
}

#[test]
fn regression_unicode_emoji_control_and_null_inputs_are_classified() {
    let env = Env::default();

    assert_eq!(
        validate_username(&s(&env, "ali🙂ce")),
        Err(ContractError::InvalidUsername)
    );
    assert_eq!(
        validate_username(&bytes(&env, b"ali\0ce")),
        Err(ContractError::InvalidUsername)
    );
    assert_eq!(
        validate_username(&bytes(&env, b"ali\nce")),
        Err(ContractError::InvalidUsername)
    );

    assert_eq!(validate_display_name(&s(&env, "🙂 creator")), Ok(()));
    assert_eq!(validate_display_name(&bytes(&env, b"\0")), Ok(()));
    assert_eq!(
        validate_display_name(&bytes(&env, b"\t\n\r ")),
        Err(ContractError::InvalidDisplayName)
    );

    assert_eq!(
        validate_x_handle(&s(&env, "@creator🙂")),
        Err(ContractError::InvalidXHandle)
    );
    assert_eq!(
        validate_x_handle(&bytes(&env, b"creator\0")),
        Err(ContractError::InvalidXHandle)
    );

    assert_eq!(validate_message(&s(&env, "thanks 🙂")), Ok(()));
    assert_eq!(
        validate_message(&bytes(&env, b"thanks\0control\nchars")),
        Ok(())
    );
}

#[test]
fn regression_maximum_length_strings_hit_exact_boundaries() {
    let env = Env::default();

    assert_eq!(
        validate_username(&s(&env, "abcdefghijklmnopqrstuvwxyz012345")),
        Ok(())
    );
    assert_eq!(
        validate_username(&s(&env, "abcdefghijklmnopqrstuvwxyz0123456")),
        Err(ContractError::InvalidUsername)
    );

    assert_eq!(validate_display_name(&bytes(&env, &[b'a'; 64])), Ok(()));
    assert_eq!(
        validate_display_name(&bytes(&env, &[b'a'; 65])),
        Err(ContractError::InvalidDisplayName)
    );

    assert_eq!(validate_x_handle(&s(&env, "@abcdefghijklmno")), Ok(()));
    assert_eq!(
        validate_x_handle(&s(&env, "@abcdefghijklmnop")),
        Err(ContractError::InvalidXHandle)
    );

    assert_eq!(validate_message(&bytes(&env, &[b'm'; 280])), Ok(()));
    assert_eq!(
        validate_message(&bytes(&env, &[b'm'; 281])),
        Err(ContractError::MessageTooLong)
    );

    assert_eq!(validate_bio(&bytes(&env, &[b'b'; 280])), Ok(()));
    assert_eq!(
        validate_bio(&bytes(&env, &[b'b'; 281])),
        Err(ContractError::MessageTooLong)
    );

    assert_eq!(validate_image_url(&bytes(&env, &[b'u'; 256])), Ok(()));
    assert_eq!(
        validate_image_url(&bytes(&env, &[b'u'; 257])),
        Err(ContractError::InvalidImageUrl)
    );
}
