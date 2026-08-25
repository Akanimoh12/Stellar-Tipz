import { z } from 'zod';

export const requestRefundSchema = z.object({
  tipTxHash: z.string().min(1, 'Tip transaction hash is required'),
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must be 500 characters or fewer'),
});

export const refundHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const refundIdParamSchema = z.object({
  id: z.string().min(1, 'Refund id is required'),
});

export const rejectRefundSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500, 'Reason must be 500 characters or fewer'),
});

export const submitRefundResolutionSchema = z.object({
  signedTxXdr: z.string().min(1, 'Signed transaction XDR is required'),
  reason: z.string().min(1).max(500).optional(),
});

export type RequestRefundInput = z.infer<typeof requestRefundSchema>;
export type RefundHistoryQuery = z.infer<typeof refundHistoryQuerySchema>;
export type RefundIdParam = z.infer<typeof refundIdParamSchema>;
export type RejectRefundInput = z.infer<typeof rejectRefundSchema>;
export type SubmitRefundResolutionInput = z.infer<typeof submitRefundResolutionSchema>;
