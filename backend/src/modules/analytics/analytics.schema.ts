import { z } from 'zod';

/** Query parameters for GET /analytics/daily. */
export const analyticsDailyQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  limit: z.coerce.number().int().min(1).max(365).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AnalyticsDailyQuery = z.infer<typeof analyticsDailyQuerySchema>;

/** Query parameters for GET /analytics/volume (issue #1008). */
export const volumeQuerySchema = z.object({
  granularity: z.enum(['day', 'week', 'month']).default('day'),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export type VolumeQuery = z.infer<typeof volumeQuerySchema>;

/** Query parameters for GET /analytics/top-tippers (issue #1009). */
export const topTippersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type TopTippersQuery = z.infer<typeof topTippersQuerySchema>;

/** Path parameters for GET /analytics/creators/:username. */
export const creatorUsernameParamSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
});

export type CreatorUsernameParam = z.infer<typeof creatorUsernameParamSchema>;

/** Query parameters for GET /analytics/creators/:username. */
export const creatorAnalyticsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});

export type CreatorAnalyticsQuery = z.infer<typeof creatorAnalyticsQuerySchema>;
