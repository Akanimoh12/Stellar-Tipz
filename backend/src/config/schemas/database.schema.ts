import { z } from 'zod';

export const databaseEnvSchema = z.object({
  /** Queries slower than this (ms) are logged as slow queries and counted (issue #095). */
  SLOW_QUERY_THRESHOLD_MS: z.coerce.number().int().positive().default(1000),
  /** Maximum PostgreSQL connections held by this process. */
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
  /** Seconds to wait for a free pooled connection before failing. */
  DATABASE_POOL_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10),
  /** PostgreSQL statement timeout applied to every Prisma connection. */
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
