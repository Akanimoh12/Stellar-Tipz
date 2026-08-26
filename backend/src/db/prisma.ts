import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { createSlowQueryMiddleware } from '../common/observability/slowQuery.js';
import { softDeleteMiddleware } from './softDelete.js';

/** Singleton Prisma client. Import `prisma` everywhere you need DB access. */
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Explicit opt-in client for admin, audit, privacy recovery, and reactivation
 * workflows that must inspect logically deleted rows. Do not use for public
 * or ordinary application reads.
 */
export const prismaIncludingDeleted = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

prisma.$use(softDeleteMiddleware);

// Instrument slow queries. Queries slower than the configured threshold are
// logged (with model/operation/duration/request id, never parameters) and
// counted as a metric. See createSlowQueryMiddleware for the PII redaction.
prisma.$use(
  createSlowQueryMiddleware({
    thresholdMs: env.SLOW_QUERY_THRESHOLD_MS,
    enabled: env.NODE_ENV !== 'test',
  }),
);
