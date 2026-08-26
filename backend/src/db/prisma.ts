import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { createSlowQueryMiddleware } from '../common/observability/slowQuery.js';

const databaseUrl = new URL(env.DATABASE_URL);
databaseUrl.searchParams.set('connection_limit', String(env.DATABASE_POOL_SIZE));
databaseUrl.searchParams.set('pool_timeout', String(env.DATABASE_POOL_TIMEOUT_SECONDS));
databaseUrl.searchParams.set(
  'socket_timeout',
  String(Math.ceil(env.DATABASE_QUERY_TIMEOUT_MS / 1000)),
);

/** Singleton Prisma client. Import `prisma` everywhere you need DB access. */
export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl.toString() } },
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
