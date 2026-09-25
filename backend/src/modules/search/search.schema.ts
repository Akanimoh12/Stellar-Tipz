import { z } from "zod";

/**
 * Search query schema for validation.
 *
 * Issue #1266
 */
export const searchQuerySchema = z.object({
  query: z.string().min(1).max(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
