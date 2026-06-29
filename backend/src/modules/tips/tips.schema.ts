import { z } from 'zod';

export const prepareTipSchema = z.object({
  from: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid sender Stellar address'),
  to: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid recipient Stellar address'),
  amount: z.string().regex(/^\d+$/, 'Amount must be a string of digits (stroops)'),
  message: z.string().max(280).optional(),
});

export type PrepareTipInput = z.infer<typeof prepareTipSchema>;

/** Path params for `GET /tips/:id`. */
export const tipIdParamSchema = z.object({
  id: z.string().cuid('Invalid tip id'),
});

export type TipIdParam = z.infer<typeof tipIdParamSchema>;

/** Path params for `GET /profiles/:username/tips`. */
export const usernameParamSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
});

export type UsernameParam = z.infer<typeof usernameParamSchema>;

/** Cursor pagination query for tip list endpoints. */
export const tipsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().cuid('Invalid cursor').optional(),
});

export type TipsListQuery = z.infer<typeof tipsListQuerySchema>;

/** Query params for `GET /tips` — filterable list of tips. */
export const getTipsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().cuid('Invalid cursor').optional(),
  address: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address').optional(),
  direction: z.enum(['sent', 'received']).optional(),
});

export type GetTipsQuery = z.infer<typeof getTipsQuerySchema>;

/** Body for `POST /tips` — record an on-chain tip (idempotent by txHash). */
export const recordTipSchema = z.object({
  txHash: z.string().min(1, 'txHash is required'),
  ledger: z.number().int().positive('Ledger must be a positive integer'),
  fromAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid sender Stellar address'),
  toAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid recipient Stellar address'),
  amountStroops: z.string().regex(/^\d+$/, 'Amount must be a string of digits (stroops)'),
  message: z.string().max(280).optional(),
});

export type RecordTipInput = z.infer<typeof recordTipSchema>;

/** Path params for `PATCH /tips/:txHash/confirm`. */
export const confirmTipParamSchema = z.object({
  txHash: z.string().min(1, 'txHash is required'),
});

export type ConfirmTipParam = z.infer<typeof confirmTipParamSchema>;
