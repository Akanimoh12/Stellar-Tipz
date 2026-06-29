import { z } from 'zod';

const tipMessageRegex = /^[\w\s.,!?'"@#$%&*()\-+=[\]{}:;<>/\\|`~\u00C0-\u024F]*$/u;

export const tipMessageSchema = z
  .string()
  .max(280, 'Message must be at most 280 characters')
  .regex(tipMessageRegex, 'Message contains disallowed characters')
  .optional();

export const submitTipSchema = z.object({
  signedTxXdr: z.string().min(1, 'Signed transaction XDR is required'),
});

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
  tokenCode: z.string().max(10).optional(),
  startDate: z.string().datetime('Invalid start date (must be ISO 8601)').optional(),
  endDate: z.string().datetime('Invalid end date (must be ISO 8601)').optional(),
});

export type TipsListQuery = z.infer<typeof tipsListQuerySchema>;
