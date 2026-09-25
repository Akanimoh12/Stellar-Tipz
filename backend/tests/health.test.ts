import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/prisma.js', () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) },
}));

vi.mock('../src/db/redis.js', () => ({
  redis: { ping: vi.fn().mockResolvedValue('PONG') },
}));

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return {
    ...actual,
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: vi.fn(() => ({
        getHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
      })),
    },
  };
});

// If this middleware runs, the liveness tests fail. Health routes must be mounted before it.
vi.mock('../src/common/middleware/rateLimiter.js', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  globalRateLimiter: (_req: unknown, res: { status: (code: number) => unknown }) => res.status(500),
}));

import { createApp } from '../src/app.js';
import { SorobanRpc } from '@stellar/stellar-sdk';
import { prisma } from '../src/db/prisma.js';
import { redis } from '../src/db/redis.js';
import { createHealthRouter } from '../src/modules/health/health.routes.js';
import {
  createHealthService,
  type DependencyName,
  type HealthDependencies,
} from '../src/modules/health/health.service.js';

function healthyDependencies(): HealthDependencies {
  return {
    postgres: vi.fn().mockResolvedValue(undefined),
    redis: vi.fn().mockResolvedValue(undefined),
    'soroban-rpc': vi.fn().mockResolvedValue(undefined),
  };
}

function buildHealthApp(
  dependencies: HealthDependencies,
  options: { checkTimeoutMs?: number; cacheTtlMs?: number } = {},
) {
  const app = express();
  app.use('/health', createHealthRouter(createHealthService(dependencies, options)));
  return request(app);
}

describe('health endpoints', () => {
  it('keeps GET /health/live cheap and independent of dependency-backed middleware', async () => {
    const response = await request(createApp()).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'pass', checks: [] });
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
    expect(SorobanRpc.Server).not.toHaveBeenCalled();
  });

  it('makes GET /health a backwards-compatible alias for readiness', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('pass');
    expect(response.body.checks).toHaveLength(3);
  });

  it('prevents the legacy GET /health probe from false-positive readiness', async () => {
    const dependencies = healthyDependencies();
    dependencies.postgres = vi.fn().mockRejectedValue(new Error('database down'));

    const response = await buildHealthApp(dependencies).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.checks).toContainEqual(
      expect.objectContaining({ name: 'postgres', status: 'fail' }),
    );
  });

  it('returns 200 when every required dependency is ready', async () => {
    const dependencies = healthyDependencies();
    const response = await buildHealthApp(dependencies).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('pass');
    expect(response.body.checks).toEqual([
      expect.objectContaining({ name: 'postgres', status: 'pass' }),
      expect.objectContaining({ name: 'redis', status: 'pass' }),
      expect.objectContaining({ name: 'soroban-rpc', status: 'pass' }),
    ]);
  });

  it.each<DependencyName>(['postgres', 'redis', 'soroban-rpc'])(
    'returns 503 and names %s when it is unavailable',
    async (failedDependency) => {
      const dependencies = healthyDependencies();
      dependencies[failedDependency] = vi.fn().mockRejectedValue(new Error('connection refused'));

      const response = await buildHealthApp(dependencies).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('fail');
      expect(response.body.checks).toContainEqual(
        expect.objectContaining({
          name: failedDependency,
          status: 'fail',
          message: `${failedDependency} is unavailable`,
        }),
      );
    },
  );

  it('fails a dependency that exceeds its individual timeout', async () => {
    const dependencies = healthyDependencies();
    dependencies.redis = vi.fn(() => new Promise(() => undefined));

    const response = await buildHealthApp(dependencies, { checkTimeoutMs: 10 }).get(
      '/health/ready',
    );

    expect(response.status).toBe(503);
    expect(response.body.checks).toContainEqual(
      expect.objectContaining({
        name: 'redis',
        status: 'fail',
        message: 'redis timed out after 10ms',
      }),
    );
  });

  it('briefly caches readiness results to protect dependencies from probe load', async () => {
    const dependencies = healthyDependencies();
    const agent = buildHealthApp(dependencies, { cacheTtlMs: 5_000 });

    const first = await agent.get('/health/ready');
    const second = await agent.get('/health/ready');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(dependencies.postgres).toHaveBeenCalledTimes(1);
    expect(dependencies.redis).toHaveBeenCalledTimes(1);
    expect(dependencies['soroban-rpc']).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent readiness probes before a result is cached', async () => {
    let releasePostgres!: () => void;
    const pendingPostgres = new Promise<void>((resolve) => {
      releasePostgres = resolve;
    });
    const dependencies = healthyDependencies();
    dependencies.postgres = vi.fn(() => pendingPostgres);
    const service = createHealthService(dependencies);

    const first = service.getReadyStatus();
    const second = service.getReadyStatus();
    releasePostgres();
    await Promise.all([first, second]);

    expect(dependencies.postgres).toHaveBeenCalledTimes(1);
    expect(dependencies.redis).toHaveBeenCalledTimes(1);
    expect(dependencies['soroban-rpc']).toHaveBeenCalledTimes(1);
  });
});
