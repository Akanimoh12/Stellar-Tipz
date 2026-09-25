import type { Prisma } from '@prisma/client';
import { getRequestId } from '../middleware/requestContext.js';
import { logger } from '../utils/logger.js';

// `recordSlowQuery` is loaded lazily to avoid a module-init cycle
// (metrics -> prisma -> slowQuery -> metrics) that would otherwise leave this
// export undefined when prisma registers the middleware at import time.
let recordSlowQueryRef: ((ms: number) => void) | null = null;
let recordPoolSaturationRef: (() => void) | null = null;
async function recordSlowQuery(ms: number): Promise<void> {
  if (!recordSlowQueryRef) {
    const metrics = await import('./metrics.js');
    recordSlowQueryRef = metrics.recordSlowQuery;
  }
  recordSlowQueryRef(ms);
}

async function recordPoolSaturation(): Promise<void> {
  if (!recordPoolSaturationRef) {
    const metrics = await import('./metrics.js');
    recordPoolSaturationRef = metrics.recordPoolSaturation;
  }
  recordPoolSaturationRef();
}

export interface SlowQueryOptions {
  /** Queries taking longer than this many milliseconds are reported. */
  thresholdMs: number;
  /** When false the middleware is a no-op (useful for disabling in tests). */
  enabled: boolean;
}

/**
 * Builds a Prisma middleware that reports queries exceeding `thresholdMs`.
 *
 * Reported fields are limited to structural metadata — `model`, `operation`,
 * `durationMs` and the correlated `requestId`. The query's `args` are
 * deliberately *never* logged: they routinely contain PII (wallet addresses,
 * messages, emails) and would be a leak (issue #095 acceptance criteria).
 */
export function createSlowQueryMiddleware(options: SlowQueryOptions) {
  return async function slowQueryMiddleware(
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
  ): Promise<unknown> {
    const start = performance.now();
    let result: unknown;
    try {
      result = await next(params);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2024') {
        logger.error(
          {
            event: 'database_pool_saturated',
            model: params.model ?? 'unknown',
            operation: params.action,
          },
          'Database connection pool is saturated',
        );
        await recordPoolSaturation();
      }
      throw error;
    }
    const durationMs = performance.now() - start;

    if (options.enabled && durationMs >= options.thresholdMs) {
      logger.warn(
        {
          event: 'slow_query',
          model: params.model ?? 'unknown',
          operation: params.action,
          durationMs: Math.round(durationMs),
          requestId: getRequestId(),
        },
        'Slow database query exceeded threshold',
      );
      await recordSlowQuery(durationMs);
    }

    return result;
  };
}
