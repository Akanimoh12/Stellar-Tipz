import { z } from 'zod';

export const usernameParamSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1),
});

export const recalculateSchema = z.object({
  userId: z.string().min(1),
});

export type UsernameParam = z.infer<typeof usernameParamSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type RecalculateInput = z.infer<typeof recalculateSchema>;
