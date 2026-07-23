import { z } from 'zod';

export const userIdParamSchema = z.object({
  userId: z.string().min(1),
});

export const recalculateSchema = z.object({
  userId: z.string().min(1),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type RecalculateInput = z.infer<typeof recalculateSchema>;
