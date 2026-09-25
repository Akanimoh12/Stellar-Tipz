import { z } from 'zod';

const tipMessageRegex = /^[\w\s.,!?'"@#$%&*()\-+=[\]{}:;<>/\\|`~\u00C0-\u024F]*$/u;

export const tipMessageSchema = z
  .string()
  .max(280, 'Message must be at most 280 characters')
  .regex(tipMessageRegex, 'Message contains disallowed characters')
  .optional();

export const submitTipSchema = z.object({
  signedTxXdr: z.string().min(1, 'Signed transaction XDR is required'),
}).strict();

export type SubmitTipInput = z.infer<typeof submitTipSchema>;

export interface SubmitTipResult {
  txHash: string;
  ledger: number;
  tipId: string;
  status: string;
}

export const prepareTipSchema = z.object({
  from: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid sender Stellar address'),
  to: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid recipient Stellar address'),
  amount: z.string().regex(/^\d+$/, 'Amount must be a string of digits (stroops)'),
  message: tipMessageSchema,
}).strict();

export type PrepareTipInput = z.infer<typeof prepareTipSchema>;

/** Path params for `GET /tips/:id`. */
export const tipIdParamSchema = z.object({
  id: z.string().cuid('Invalid tip id'),
}).strict();

export type TipIdParam = z.infer<typeof tipIdParamSchema>;

/** Path params for `GET /profiles/:username/tips`. */
export const usernameParamSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
}).strict();

export type UsernameParam = z.infer<typeof usernameParamSchema>;

/** Cursor pagination query for tip list endpoints. */
export const tipsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1, 'Invalid cursor').optional(),
  offset: z.coerce.number().int().min(0).optional(),
  tokenCode: z.string().max(10).optional(),
  startDate: z.string().datetime('Invalid start date (must be ISO 8601)').optional(),
  endDate: z.string().datetime('Invalid end date (must be ISO 8601)').optional(),
}).strict().refine((query) => query.cursor === undefined || query.offset === undefined, {
  message: 'cursor and offset cannot be used together',
});

export type TipsListQuery = z.infer<typeof tipsListQuerySchema>;

/** Query params for `GET /tips` — filterable list of tips. */
export const getTipsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1, 'Invalid cursor').optional(),
  offset: z.coerce.number().int().min(0).optional(),
  address: z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address').optional(),
  direction: z.enum(['sent', 'received']).optional(),
  tokenCode: z.string().max(10).optional(),
  startDate: z.string().datetime('Invalid start date (must be ISO 8601)').optional(),
  endDate: z.string().datetime('Invalid end date (must be ISO 8601)').optional(),
  aggregate: z.enum(['creator']).optional(),
}).strict().refine((query) => query.cursor === undefined || query.offset === undefined, {
  message: 'cursor and offset cannot be used together',
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
}).strict();

export type RecordTipInput = z.infer<typeof recordTipSchema>;

/** Path params for `PATCH /tips/:txHash/confirm`. */
export const confirmTipParamSchema = z.object({
  txHash: z.string().min(1, 'txHash is required'),
}).strict();

export type ConfirmTipParam = z.infer<typeof confirmTipParamSchema>;

/** Path params for `GET /tips/:txHash/receipt`. */
export const receiptParamSchema = z.object({
  txHash: z.string().min(1, 'txHash is required'),
}).strict();

export type ReceiptParam = z.infer<typeof receiptParamSchema>;
