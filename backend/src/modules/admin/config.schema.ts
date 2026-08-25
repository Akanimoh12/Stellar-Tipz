import { z } from 'zod';

/**
 * Contract bounds (mirrors the Soroban contract exactly):
 *   fee_bps:                 u32 in [0, 1000]   (max 10%)
 *   min_tip_amount:          i128 >= 0           (stroops, string representation)
 *   min_withdrawal_amount:   i128 >= 0           (stroops, string representation)
 *   paused:                  bool
 */

/** A non-negative integer as a decimal string, representing a stroops i128 value. */
const stroopsString = z
  .string()
  .regex(/^\d+$/, 'Must be a non-negative integer string (stroops)')
  .refine((s) => {
    try {
      const n = BigInt(s);
      return n >= 0n;
    } catch {
      return false;
    }
  }, 'Must be a non-negative integer');

// ── Prepare schemas ───────────────────────────────────────────────────────────

export const prepareSetFeeSchema = z.object({
  /** New fee in basis points. Contract bound: 0–1000 (max 10%). */
  feeBps: z.number().int().min(0).max(1000, 'fee_bps must be ≤ 1000 (10%)'),
});

export const prepareSetMinTipAmountSchema = z.object({
  /** New minimum tip amount in stroops (>= 0). */
  amount: stroopsString,
});

export const prepareSetMinWithdrawalAmountSchema = z.object({
  /** New minimum withdrawal amount in stroops (>= 0). */
  amount: stroopsString,
});

export const preparePauseSchema = z.object({
  /** true = pause, false = unpause. */
  paused: z.boolean(),
});

// ── Submit schemas ────────────────────────────────────────────────────────────

export const submitSetFeeSchema = z.object({
  feeBps: z.number().int().min(0).max(1000, 'fee_bps must be ≤ 1000 (10%)'),
  signedTxXdr: z.string().min(1, 'signedTxXdr is required'),
});

export const submitSetMinTipAmountSchema = z.object({
  amount: stroopsString,
  signedTxXdr: z.string().min(1, 'signedTxXdr is required'),
});

export const submitSetMinWithdrawalAmountSchema = z.object({
  amount: stroopsString,
  signedTxXdr: z.string().min(1, 'signedTxXdr is required'),
});

export const submitPauseSchema = z.object({
  paused: z.boolean(),
  signedTxXdr: z.string().min(1, 'signedTxXdr is required'),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type PrepareSetFeeInput = z.infer<typeof prepareSetFeeSchema>;
export type PrepareSetMinTipAmountInput = z.infer<typeof prepareSetMinTipAmountSchema>;
export type PrepareSetMinWithdrawalAmountInput = z.infer<typeof prepareSetMinWithdrawalAmountSchema>;
export type PreparePauseInput = z.infer<typeof preparePauseSchema>;

export type SubmitSetFeeInput = z.infer<typeof submitSetFeeSchema>;
export type SubmitSetMinTipAmountInput = z.infer<typeof submitSetMinTipAmountSchema>;
export type SubmitSetMinWithdrawalAmountInput = z.infer<typeof submitSetMinWithdrawalAmountSchema>;
export type SubmitPauseInput = z.infer<typeof submitPauseSchema>;
