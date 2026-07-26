import { z } from 'zod';

/** Query parameters for GET /analytics/daily. */
export const analyticsDailyQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  limit: z.coerce.number().int().min(1).max(365).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AnalyticsDailyQuery = z.infer<typeof analyticsDailyQuerySchema>;
