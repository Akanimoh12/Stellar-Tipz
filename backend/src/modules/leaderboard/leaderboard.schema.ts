import { z } from 'zod';

export const leaderboardQuerySchema = z.object({
  window: z.enum(['24h', '7d', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Opaque `nextCursor` from the previous page (issue #1269). */
  cursor: z.string().min(1, 'Invalid cursor').optional(),
  /** Deprecated: use `cursor`. */
  offset: z.coerce.number().int().min(0).optional(),
}).strict().refine((query) => query.cursor === undefined || query.offset === undefined, {
  message: 'cursor and offset cannot be used together',
  path: ['cursor'],
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1),
}).strict();

export const snapshotPeriodSchema = z.enum(['WEEKLY', 'MONTHLY', 'ALL_TIME']);

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type SnapshotPeriod = z.infer<typeof snapshotPeriodSchema>;
export type TimeWindow = LeaderboardQuery['window'];
