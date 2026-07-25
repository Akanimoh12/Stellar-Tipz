import { z } from "zod";

/**
 * Zod validation schemas for X integration endpoints.
 */

export const xHandleSchema = z.object({
  handle: z
    .string()
    .min(1)
    .max(15)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "X handle must contain only letters, numbers, and underscores",
    ),
});

export const fetchMetricsSchema = z.object({
  handle: z
    .string()
    .min(1)
    .max(15)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "X handle must contain only letters, numbers, and underscores",
    ),
  useFallback: z.boolean().optional().default(true),
  maxCacheAge: z
    .number()
    .optional()
    .default(24 * 60 * 60 * 1000), // 24 hours
});

export type XHandleInput = z.infer<typeof xHandleSchema>;
export type FetchMetricsInput = z.infer<typeof fetchMetricsSchema>;
