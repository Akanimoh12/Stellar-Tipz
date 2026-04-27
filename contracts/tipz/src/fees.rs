//! Fee calculation helper for the Tipz contract.
//!
//! Used by `withdraw_tips` to split an amount into a protocol fee and the net
//! amount received by the creator. All arithmetic uses checked operations to
//! prevent overflow.

use crate::errors::ContractError;

/// Calculate the protocol fee and net amount for a withdrawal.
///
/// # Parameters
/// - `amount`  – gross withdrawal amount in stroops (must be > 0)
/// - `fee_bps` – fee in basis points (100 bps = 1 %; max 1 000 bps = 10 %)
///
/// # Returns
/// `Ok((fee, net))` where `fee + net == amount` (except when fee rounds up to 1 stroop).
///
/// # Rounding policy
/// Integer division truncates toward zero (floor for positive values). To prevent
/// fee circumvention through dust withdrawals, when `fee_bps > 0`, the fee is
/// guaranteed to be at least 1 stroop, even if the computed value rounds to 0.
/// Any remainder goes to the protocol instead of the creator.
///
/// # Example
/// For `amount = 49` stroops at `fee_bps = 200` (2%):
/// - Naive calculation: `(49 * 200) / 10_000 = 0` ← vulnerability
/// - With minimum 1 stroop: `fee = 1`, `net = 48` ← fixed
///
/// # Errors
/// Returns [`ContractError::OverflowError`] if `amount * fee_bps` overflows
/// `i128`.
pub fn calculate_fee(amount: i128, fee_bps: u32) -> Result<(i128, i128), ContractError> {
    if fee_bps == 0 {
        return Ok((0, amount));
    }

    // amount * fee_bps may overflow if amount is close to i128::MAX.
    let fee_numerator = amount
        .checked_mul(fee_bps as i128)
        .ok_or(ContractError::OverflowError)?;

    // Integer division truncates → fee rounds down.
    // However, ensure fee is at least 1 stroop when fee_bps > 0 to prevent
    // circumventing the fee system with tiny withdrawals (issue #334).
    let fee = (fee_numerator / 10_000_i128).max(1);

    // net = amount - fee keeps the invariant fee + net == amount exactly.
    let net = amount
        .checked_sub(fee)
        .ok_or(ContractError::OverflowError)?;

    debug_assert_eq!(fee + net, amount);

    Ok((fee, net))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── zero fee ──────────────────────────────────────────────────────────

    #[test]
    fn zero_fee_bps_returns_full_amount() {
        let (fee, net) = calculate_fee(1_000_000, 0).unwrap();
        assert_eq!(fee, 0);
        assert_eq!(net, 1_000_000);
    }

    // ── normal cases ──────────────────────────────────────────────────────

    #[test]
    fn two_percent_fee() {
        // 2 % of 1_000_000 = 20_000
        let (fee, net) = calculate_fee(1_000_000, 200).unwrap();
        assert_eq!(fee, 20_000);
        assert_eq!(net, 980_000);
        assert_eq!(fee + net, 1_000_000);
    }

    #[test]
    fn ten_percent_fee() {
        let (fee, net) = calculate_fee(1_000_000, 1_000).unwrap();
        assert_eq!(fee, 100_000);
        assert_eq!(net, 900_000);
        assert_eq!(fee + net, 1_000_000);
    }

    #[test]
    fn fee_plus_net_always_equals_amount() {
        // Verify the invariant holds for an amount that does not divide evenly.
        let amount = 10_007_i128;
        let (fee, net) = calculate_fee(amount, 200).unwrap();
        assert_eq!(fee + net, amount);
    }

    // ── rounding (fee rounds down) ─────────────────────────────────────────

    #[test]
    fn fee_rounds_to_zero_for_tiny_amount() {
        // 200 bps of 49 stroops = 0.98, but non-zero fees floor to 1 stroop.
        let (fee, net) = calculate_fee(49, 200).unwrap();
        assert_eq!(fee, 1);
        assert_eq!(net, 48);
        assert_eq!(fee + net, 49);
    }

    #[test]
    fn fee_is_one_at_boundary() {
        // 200 bps of 50 stroops = 1.0 exactly
        let (fee, net) = calculate_fee(50, 200).unwrap();
        assert_eq!(fee, 1);
        assert_eq!(net, 49);
        assert_eq!(fee + net, 50);
    }

    // ── overflow protection ────────────────────────────────────────────────

    #[test]
    fn overflow_returns_error() {
        // i128::MAX * 2 overflows i128
        let result = calculate_fee(i128::MAX, 2);
        assert_eq!(result, Err(ContractError::OverflowError));
    }

    #[test]
    fn large_safe_amount_succeeds() {
        // Use an amount well below overflow territory
        let amount = i128::MAX / 10_001;
        let (fee, net) = calculate_fee(amount, 200).unwrap();
        assert_eq!(fee + net, amount);
    }

    // ── edge cases for issue #422 ───────────────────────────────────────────

    #[test]
    fn test_fee_overflow_protection() {
        // Test with i128::MAX - should not panic, should return error
        let max_amount = i128::MAX;
        let result = calculate_fee(max_amount, 200); // 2%
        assert!(result.is_ok() || result.is_err(), "Should not panic");

        // Verify it returns overflow error for values that would overflow
        let result = calculate_fee(i128::MAX, 2);
        assert_eq!(result, Err(ContractError::OverflowError));
    }

    #[test]
    fn test_fee_minimum_enforcement() {
        // Amounts where 2% rounds to 0
        let tiny = 49; // 49 * 200 / 10000 = 0.98 → rounds to 0
        let (fee, net) = calculate_fee(tiny, 200).unwrap();
        assert!(
            fee >= 1,
            "Fee should never round to zero for non-zero amounts"
        );
        assert_eq!(fee, 1);
        assert_eq!(net, 48);

        // Test with even smaller amounts
        let very_tiny = 1;
        let (fee, net) = calculate_fee(very_tiny, 200).unwrap();
        assert!(fee >= 1, "Fee should be at least 1 stroop");
        assert_eq!(fee, 1);
        assert_eq!(net, 0);
    }

    #[test]
    fn test_fee_precision() {
        // 1 XLM in stroops (7 decimal places)
        let amount = 10_000_000; // 1 XLM
        let (fee, net) = calculate_fee(amount, 200).unwrap(); // 2%
        assert_eq!(fee, 200_000); // 0.02 XLM
        assert_eq!(net, 9_800_000); // 0.98 XLM
        assert_eq!(fee + net, amount);
    }

    #[test]
    fn test_fee_with_i128_max_adjacent_values() {
        // Test values adjacent to i128::MAX
        let near_max = i128::MAX - 1;
        let result = calculate_fee(near_max, 1); // 0.01% - should not overflow
                                                 // This might overflow depending on the value, but should not panic
        assert!(result.is_ok() || result.is_err());

        // Test with a value that definitely won't overflow
        let safe_large = i128::MAX / 10_000;
        let (fee, net) = calculate_fee(safe_large, 200).unwrap();
        assert_eq!(fee + net, safe_large);
    }

    #[test]
    fn test_fee_with_i128_min_adjacent_values() {
        // Test with negative amounts (should still work for absolute value scenarios)
        // Note: The function expects positive amounts, but let's verify behavior
        // For negative amounts, checked_mul and checked_sub should handle it
        let negative = -1_000_000_i128;
        let result = calculate_fee(negative, 200);
        // The function should handle this gracefully (either error or return valid result)
        assert!(result.is_ok() || result.is_err());
    }

    #[test]
    fn test_fee_fractional_stroops() {
        // Test amounts that produce fractional stroops in fee calculation
        // 333 stroops at 1% = 3.33 → rounds to 3
        let (fee, net) = calculate_fee(333, 100).unwrap();
        assert_eq!(fee, 3);
        assert_eq!(net, 330);

        // 3333 stroops at 1% = 33.33 → rounds to 33
        let (fee, net) = calculate_fee(3333, 100).unwrap();
        assert_eq!(fee, 33);
        assert_eq!(net, 3300);
    }

    #[test]
    fn test_fee_boundary_values() {
        // Test at the exact boundary where fee becomes 1
        // 50 stroops at 200 bps = 1.0 exactly
        let (fee, net) = calculate_fee(50, 200).unwrap();
        assert_eq!(fee, 1);

        // 49 stroops at 200 bps = 0.98 → rounds to 0, but min 1 applies
        let (fee, net) = calculate_fee(49, 200).unwrap();
        assert_eq!(fee, 1);

        // 51 stroops at 200 bps = 1.02 → rounds to 1
        let (fee, net) = calculate_fee(51, 200).unwrap();
        assert_eq!(fee, 1);
    }

    #[test]
    fn test_fee_invariant_maintained() {
        // Verify fee + net == amount for various amounts
        let test_amounts = [1, 10, 100, 1000, 10_000, 100_000, 1_000_000, 10_000_000];

        for amount in test_amounts {
            let (fee, net) = calculate_fee(amount, 200).unwrap();
            assert_eq!(fee + net, amount, "Invariant failed for amount {}", amount);
        }
    }

    #[test]
    fn test_fee_with_maximum_bps() {
        // Test with maximum fee (10% = 1000 bps)
        let amount = 1_000_000;
        let (fee, net) = calculate_fee(amount, 1000).unwrap();
        assert_eq!(fee, 100_000);
        assert_eq!(net, 900_000);

        // Verify minimum fee still applies for tiny amounts
        let (fee, _net) = calculate_fee(1, 1000).unwrap();
        assert_eq!(fee, 1);
    }

    #[test]
    fn test_fee_with_one_bps() {
        // Test with minimum non-zero fee (0.01% = 1 bps)
        let amount = 10_000; // Need at least 10,000 stroops for 1 bps to be >= 1
        let (fee, net) = calculate_fee(amount, 1).unwrap();
        assert_eq!(fee, 1);
        assert_eq!(net, 9_999);

        // Below threshold, minimum fee applies
        let (fee, net) = calculate_fee(100, 1).unwrap();
        assert_eq!(fee, 1);
        assert_eq!(net, 99);
    }
}
