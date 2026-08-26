import { z } from 'zod';

const stellarAddress = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, 'Must be a valid Stellar address (G..., 56 chars)');

export const listSubscriptionsQuerySchema = z.object({
  role: z.enum(['tipper', 'creator']).default('tipper'),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1, 'Invalid cursor').optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).refine((query) => query.cursor === undefined || query.offset === undefined, {
  message: 'cursor and offset cannot be used together',
});

export const prepareCreateSubscriptionSchema = z.object({
  creatorStellarAddress: stellarAddress,
  amountStroops: z.string().regex(/^\d+$/, 'Amount must be a string of digits (stroops)'),
  interval: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
});

export const submitCreateSubscriptionSchema = prepareCreateSubscriptionSchema.extend({
  signedTxXdr: z.string().min(1, 'Signed transaction XDR is required'),
});

export const prepareCancelSubscriptionSchema = z.object({
  creatorStellarAddress: stellarAddress,
});

export const submitCancelSubscriptionSchema = prepareCancelSubscriptionSchema.extend({
  signedTxXdr: z.string().min(1, 'Signed transaction XDR is required'),
});

export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;
export type PrepareCreateSubscriptionInput = z.infer<typeof prepareCreateSubscriptionSchema>;
export type SubmitCreateSubscriptionInput = z.infer<typeof submitCreateSubscriptionSchema>;
export type PrepareCancelSubscriptionInput = z.infer<typeof prepareCancelSubscriptionSchema>;
export type SubmitCancelSubscriptionInput = z.infer<typeof submitCancelSubscriptionSchema>;
