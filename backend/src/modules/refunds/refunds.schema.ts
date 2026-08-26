import { z } from 'zod';

export const requestRefundSchema = z.object({
  tipTxHash: z.string().min(1, 'Tip transaction hash is required'),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must be 500 characters or fewer'),
});

export const refundHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1, 'Invalid cursor').optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).refine((query) => query.cursor === undefined || query.offset === undefined, {
  message: 'cursor and offset cannot be used together',
});

export type RequestRefundInput = z.infer<typeof requestRefundSchema>;
export type RefundHistoryQuery = z.infer<typeof refundHistoryQuerySchema>;
