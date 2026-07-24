import { z } from 'zod';

export const withdrawalHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const prepareWithdrawalSchema = z.object({
  amount: z.string().regex(/^\d+$/, 'Amount must be a string of digits (stroops)'),
});

export type WithdrawalHistoryQuery = z.infer<typeof withdrawalHistoryQuerySchema>;
export type PrepareWithdrawalInput = z.infer<typeof prepareWithdrawalSchema>;
