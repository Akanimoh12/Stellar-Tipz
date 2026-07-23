import { z } from 'zod';

export const leaderboardQuerySchema = z.object({
  period: z.enum(['WEEKLY', 'MONTHLY', 'ALL_TIME']).default('ALL_TIME'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
