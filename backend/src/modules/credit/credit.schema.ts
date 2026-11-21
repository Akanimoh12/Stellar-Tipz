import { z } from 'zod';

export const creditIdentifierParamSchema = z.object({
  identifier: z.string().min(1).max(100),
}).strict();

export const userIdParamSchema = z.object({
  userId: z.string().min(1),
}).strict();

export const recalculateSchema = z.object({
  userId: z.string().min(1),
}).strict();

export const creditHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();

export type CreditIdentifierParam = z.infer<typeof creditIdentifierParamSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type RecalculateInput = z.infer<typeof recalculateSchema>;
export type CreditHistoryQuery = z.infer<typeof creditHistoryQuerySchema>;
