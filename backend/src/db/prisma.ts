import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { createSlowQueryMiddleware } from '../common/observability/slowQuery.js';

/** Singleton Prisma client. Import `prisma` everywhere you need DB access. */
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Instrument slow queries. Queries slower than the configured threshold are
// logged (with model/operation/duration/request id, never parameters) and
// counted as a metric. See createSlowQueryMiddleware for the PII redaction.
prisma.$use(
  createSlowQueryMiddleware({
    thresholdMs: env.SLOW_QUERY_THRESHOLD_MS,
    enabled: env.NODE_ENV !== 'test',
  }),
);
