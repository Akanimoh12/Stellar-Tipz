import { z } from "zod";
import { env } from "@/config/env.js";

/**
 * Zod validation schemas for withdrawal endpoints (#942).
 *
 * `amount` is accepted as a string of stroops to avoid precision loss over
 * JSON (BigInt is not JSON-serialisable) and is enforced to be at least
 * `WITHDRAWAL_MIN_AMOUNT_STROOPS`.
 */
export const createWithdrawalSchema = z.object({
  amount: z
    .string()
    .regex(/^[1-9]\d*$/, "amount must be a positive integer string (stroops)")
    .refine(
      (value) => /^[1-9]\d*$/.test(value) && BigInt(value) >= BigInt(env.WITHDRAWAL_MIN_AMOUNT_STROOPS),
      { message: `amount must be at least ${env.WITHDRAWAL_MIN_AMOUNT_STROOPS} stroops` },
    ),
});

export const withdrawalIdSchema = z.object({
  id: z.string().min(1),
});

export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;
export type WithdrawalIdInput = z.infer<typeof withdrawalIdSchema>;
import { z } from 'zod';

export const withdrawalHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type WithdrawalHistoryQuery = z.infer<typeof withdrawalHistoryQuerySchema>;

export const prepareWithdrawalSchema = z.object({
  amount: z.string().regex(/^\d+$/, 'Amount must be a string of digits (stroops)'),
});

export type PrepareWithdrawalInput = z.infer<typeof prepareWithdrawalSchema>;
