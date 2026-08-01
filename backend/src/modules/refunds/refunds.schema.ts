import { z } from 'zod';

export const requestRefundSchema = z.object({
  tipTxHash: z.string().min(1, 'Tip transaction hash is required'),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must be 500 characters or fewer'),
});

export const refundHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type RequestRefundInput = z.infer<typeof requestRefundSchema>;
export type RefundHistoryQuery = z.infer<typeof refundHistoryQuerySchema>;
