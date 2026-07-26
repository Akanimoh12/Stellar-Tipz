import { z } from 'zod';

/** Query parameters for GET /search/creators. */
export const searchCreatorsQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type SearchCreatorsQuery = z.infer<typeof searchCreatorsQuerySchema>;

/** Query parameters for GET /search/trending (issue #1016). */
export const trendingCreatorsQuerySchema = z.object({
  window: z.enum(['24h', '7d', '30d']).default('7d'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type TrendingCreatorsQuery = z.infer<typeof trendingCreatorsQuerySchema>;
