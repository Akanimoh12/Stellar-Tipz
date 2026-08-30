import { Request, Response } from 'express';
import { redis } from '../../db/redis.js';
import { prisma } from '../../db/prisma.js';
import { logger } from '../utils/logger.js';
import { env } from '../../config/env.js';

export interface MetricsData {
  timestamp: string;
  service: string;
  uptime: number;
  process: {
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
    cpu: {
      user: number;
      system: number;
    };
  };
  redis: {
    connected: boolean;
    info?: string;
  };
  http: {
    requests_total: number;
    requests_errors: number;
    latency_ms: number;
  };
  database: {
    pool_size: number;
    pool_timeout_seconds: number;
    /** Cumulative Prisma pool acquisition timeouts (P2024). */
    pool_saturation_total: number;
    query_timeout_ms: number;
    /** Cumulative count of queries that exceeded the slow-query threshold. */
    slow_queries_total: number;
  };
  retention: {
    rows_pruned_total: Record<string, number>;
  };
  circuitBreaker?: Record<string, { state: string; failures: number; opens: number }>;
  timeouts?: {
    request_timeout_ms: number;
    rpc_timeout_ms: number;
    horizon_timeout_ms: number;
    ipfs_timeout_ms: number;
    x_api_timeout_ms: number;
  };
}

let requestCount = 0;
let errorCount = 0;
let latencySum = 0;
let latencyCount = 0;
let slowQueryCount = 0;
let poolSaturationCount = 0;
const retentionPrunedCounts: Record<string, number> = {};

export function recordRequest(duration: number) {
  requestCount++;
  latencySum += duration;
  latencyCount++;
}

export function recordError() {
  errorCount++;
}

/** Records a single slow query event for the `/metrics` endpoint. */
export function recordSlowQuery() {
  slowQueryCount++;
}

export function recordPoolSaturation(): void {
  poolSaturationCount++;
}

/** Records rows removed by one completed retention batch. */
export function recordRetentionPruned(model: string, count: number): void {
  retentionPrunedCounts[model] = (retentionPrunedCounts[model] ?? 0) + count;
}

export async function getMetrics(): Promise<MetricsData> {
  logger.debug('Collecting metrics');

  const memory = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const redisConnected = redis.status === 'ready';
  const avgLatency = latencyCount > 0 ? latencySum / latencyCount : 0;

  let redisInfo: string | undefined;
  if (redisConnected) {
    try {
      const info = await redis.info('stats');
      redisInfo = info;
    } catch {
      redisInfo = undefined;
    }
  }

  // Circuit breaker states (issue #091) — lazy import to avoid cycle
  let circuitBreaker: Record<string, { state: string; failures: number; opens: number }> | undefined;
  try {
    const { getCircuitBreakerMetrics } = await import('../utils/circuitBreaker.js');
    circuitBreaker = getCircuitBreakerMetrics();
  } catch {
    circuitBreaker = undefined;
  }

  return {
    timestamp: new Date().toISOString(),
    service: 'stellar-tipz-backend',
    uptime: process.uptime(),
    process: {
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
    },
    redis: {
      connected: redisConnected,
      info: redisInfo,
    },
    http: {
      requests_total: requestCount,
      requests_errors: errorCount,
      latency_ms: Math.round(avgLatency),
    },
    database: {
      pool_size: env.DATABASE_POOL_SIZE,
      pool_timeout_seconds: env.DATABASE_POOL_TIMEOUT_SECONDS,
      pool_saturation_total: poolSaturationCount,
      query_timeout_ms: env.DATABASE_QUERY_TIMEOUT_MS,
      slow_queries_total: slowQueryCount,
    },
    retention: {
      rows_pruned_total: { ...retentionPrunedCounts },
    },
    circuitBreaker,
    timeouts: {
      request_timeout_ms: env.REQUEST_TIMEOUT_MS,
      rpc_timeout_ms: env.SOROBAN_RPC_TIMEOUT_MS,
      horizon_timeout_ms: env.HORIZON_TIMEOUT_MS,
      ipfs_timeout_ms: env.IPFS_TIMEOUT_MS,
      x_api_timeout_ms: env.X_API_TIMEOUT_MS,
    },
  };
}

export async function metricsController(req: Request, res: Response) {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', 'application/json');
    res.json(metrics);
  } catch (error) {
    logger.error({ error }, 'Failed to collect metrics');
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
}

export function metricsMiddleware(req: Request, res: Response, next: () => void) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    recordRequest(duration);

    if (res.statusCode >= 400) {
      recordError();
    }
  });

  next();
}
