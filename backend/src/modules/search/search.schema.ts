import { z } from 'zod';

/** Query parameters for GET /search/creators. */
export const searchCreatorsQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['relevance', 'recent', 'popular']).default('relevance'),
});

export type SearchCreatorsQuery = z.infer<typeof searchCreatorsQuerySchema>;

export type SearchSort = SearchCreatorsQuery['sort'];

/** Query parameters for GET /search/creators/trending. */
export const getTrendingCreatorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type GetTrendingCreatorsQuery = z.infer<typeof getTrendingCreatorsQuerySchema>;
