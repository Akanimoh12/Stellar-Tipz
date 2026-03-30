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
        // 200 bps of 49 stroops = 0.98 → rounds down to 0, but enforced minimum is 1
        // This test verifies the fix for issue #334: preventing fee-free withdrawals
        let (fee, net) = calculate_fee(49, 200).unwrap();
        assert_eq!(fee, 1, "Fee should be at least 1 stroop to prevent fee circumvention");
        assert_eq!(net, 48, "Net should be amount - fee");
        assert_eq!(fee + net, 49, "Invariant: fee + net == amount");
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
}
