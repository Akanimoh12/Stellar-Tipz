import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolate from a real Redis connection; otherwise ioredis emits a `close`
// event that calls logger.warn and pollutes these assertions.
vi.mock('../../db/redis.js', () => ({
  redis: {
    status: 'ready',
    info: vi.fn(async () => ''),
  },
}));

import { runWithRequestContext } from '../middleware/requestContext.js';
import { createSlowQueryMiddleware } from './slowQuery.js';
import { logger } from '../utils/logger.js';
import { getMetrics } from './metrics.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function params(overrides: Record<string, unknown> = {}) {
  return {
    model: 'Tip' as const,
    action: 'findMany' as const,
    args: { where: { stellarAddress: 'GABC...' } },
    dataPath: [] as string[],
    runInTransaction: false,
    ...overrides,
  };
}

describe('createSlowQueryMiddleware (issue #095)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a slow query with model/operation/duration/requestId and increments the metric', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const before = (await getMetrics()).database.slow_queries_total;

    const middleware = createSlowQueryMiddleware({ thresholdMs: 1, enabled: true });
    const next = vi.fn(async () => {
      await delay(8);
      return 'result';
    });

    const result = await middleware(params(), next);

    expect(result).toBe('result');
    expect(next).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();

    const logged: Record<string, unknown> = warn.mock.calls[0][0] as Record<string, unknown>;
    expect(logged.event).toBe('slow_query');
    expect(logged.model).toBe('Tip');
    expect(logged.operation).toBe('findMany');
    expect(typeof logged.durationMs).toBe('number');
    expect((logged.durationMs as number) >= 1).toBe(true);
    // Correlation field is present.
    expect('requestId' in logged).toBe(true);

    // Parameter redaction: query args (PII) must never appear in the log.
    const serialized = JSON.stringify(warn.mock.calls[0][0]);
    expect(serialized).not.toContain('GABC');
    expect(logged.args).toBeUndefined();

    // Exposed as a metric, not only logs.
    expect((await getMetrics()).database.slow_queries_total).toBe(before + 1);
  });

  it('does not log or increment the metric for fast queries', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const before = (await getMetrics()).database.slow_queries_total;

    const middleware = createSlowQueryMiddleware({ thresholdMs: 1000, enabled: true });
    const next = vi.fn(async () => 'ok');

    await middleware(params({ model: 'User', action: 'findUnique' }), next);

    expect(warn).not.toHaveBeenCalled();
    expect((await getMetrics()).database.slow_queries_total).toBe(before);
  });

  it('is a no-op when disabled', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const middleware = createSlowQueryMiddleware({ thresholdMs: 1, enabled: false });
    const next = vi.fn(async () => {
      await delay(8);
      return 'ok';
    });

    await middleware(params(), next);

    expect(warn).not.toHaveBeenCalled();
  });

  it('correlates a slow query with the active request id', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const middleware = createSlowQueryMiddleware({ thresholdMs: 1, enabled: true });
    const next = vi.fn(async () => {
      await delay(8);
      return null;
    });

    await runWithRequestContext('req-corr-xyz', async () => {
      await middleware(params(), next);
    });

    const logged: Record<string, unknown> = warn.mock.calls[0][0] as Record<string, unknown>;
    expect(logged.requestId).toBe('req-corr-xyz');
  });
});
