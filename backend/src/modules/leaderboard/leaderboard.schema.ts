import { z } from "zod";

/**
 * Zod validation schemas for the leaderboard module.
 * Issue #933 – Leaderboard by credit score variant.
 */

export const leaderboardQuerySchema = z.object({
  variant: z.enum(["tips", "credit"]).default("tips"),
  period: z.enum(["WEEKLY", "MONTHLY", "ALL_TIME"]).default("ALL_TIME"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
import { z } from 'zod';

export const leaderboardQuerySchema = z.object({
  window: z.enum(['24h', '7d', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type TimeWindow = '24h' | '7d' | 'all';
