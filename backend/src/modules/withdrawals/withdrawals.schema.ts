import { z } from 'zod';

export const withdrawalHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1, 'Invalid cursor').optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).strict().refine((query) => query.cursor === undefined || query.offset === undefined, {
  message: 'cursor and offset cannot be used together',
});

export const prepareWithdrawalSchema = z.object({
  amount: z.string().regex(/^\d+$/, 'Amount must be a string of digits (stroops)'),
}).strict();

export const submitWithdrawalSchema = z.object({
  amount: z.string().regex(/^\d+$/, 'Amount must be a string of digits (stroops)'),
  signedTxXdr: z.string().min(1, 'Signed transaction XDR is required'),
}).strict();

export type WithdrawalHistoryQuery = z.infer<typeof withdrawalHistoryQuerySchema>;
export type PrepareWithdrawalInput = z.infer<typeof prepareWithdrawalSchema>;
export type SubmitWithdrawalInput = z.infer<typeof submitWithdrawalSchema>;
