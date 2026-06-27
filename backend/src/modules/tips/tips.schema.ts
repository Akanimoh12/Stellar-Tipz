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
