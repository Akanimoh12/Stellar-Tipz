import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPublish, mockLoggerError } = vi.hoisted(() => ({
  mockPublish: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('../src/db/redis.js', () => ({
  redis: { publish: mockPublish },
}));

vi.mock('../src/common/utils/logger.js', () => ({
  logger: {
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../src/realtime/catchup.js', () => ({
  publishRoomEvent: vi.fn().mockResolvedValue(undefined),
}));

import { publishProjection } from '../src/indexer/realtime-publisher.js';
import { createHealthRouter } from '../src/modules/health/health.routes.js';
import {
  createHealthService,
  type HealthDependencies,
} from '../src/modules/health/health.service.js';
import type { DecodedEvent } from '../src/indexer/sorobanClient.js';

const projectionEvent: DecodedEvent = {
  ledger: 42,
  txHash: 'failure-injection-tx',
  pagingToken: '42-0',
  topic: 'tip_sent',
  value: { from: 'GAAA', to: 'GBBB', amount: '100' },
};

function healthyDependencies(): HealthDependencies {
  return {
    postgres: vi.fn().mockResolvedValue(undefined),
    redis: vi.fn().mockResolvedValue(undefined),
    'soroban-rpc': vi.fn().mockResolvedValue(undefined),
    indexer: vi.fn().mockResolvedValue(undefined),
  };
}

function healthClient(dependencies: HealthDependencies) {
  const app = express();
  app.use(
    '/health',
    createHealthRouter(
      createHealthService(dependencies, { checkTimeoutMs: 20, cacheTtlMs: 0 }),
    ),
  );
  return request(app);
}

describe('failure injection behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublish.mockResolvedValue(1);
  });

  it.each([
    ['database unavailable', 'postgres', 'database connection refused'],
    ['Redis unavailable', 'redis', 'Redis connection refused'],
    ['RPC error', 'soroban-rpc', 'RPC returned an error'],
  ] as const)('%s is reported and recovers automatically', async (_scenario, dependency, errorMessage) => {
    const dependencies = healthyDependencies();
    dependencies[dependency] = vi.fn().mockRejectedValue(new Error(errorMessage));
    const client = healthClient(dependencies);

    const failed = await client.get('/health/ready');
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({ status: 'fail' });
    expect(failed.body.checks).toContainEqual(
      expect.objectContaining({
        name: dependency,
        status: 'fail',
        message: `${dependency} is unavailable`,
      }),
    );

    dependencies[dependency] = vi.fn().mockResolvedValue(undefined);
    const recovered = await client.get('/health/ready');
    expect(recovered.status).toBe(200);
    expect(recovered.body).toMatchObject({ status: 'pass' });
    expect(recovered.body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: dependency, status: 'pass' }),
      ]),
    );
  });

  it('reports an RPC timeout without hanging and recovers when the RPC responds', async () => {
    const dependencies = healthyDependencies();
    dependencies['soroban-rpc'] = vi.fn(() => new Promise(() => undefined));
    const client = healthClient(dependencies);

    const failed = await client.get('/health/ready');
    expect(failed.status).toBe(503);
    expect(failed.body.checks).toContainEqual(
      expect.objectContaining({
        name: 'soroban-rpc',
        status: 'fail',
        message: 'soroban-rpc timed out after 20ms',
      }),
    );

    dependencies['soroban-rpc'] = vi.fn().mockResolvedValue(undefined);
    const recovered = await client.get('/health/ready');
    expect(recovered.status).toBe(200);
    expect(recovered.body.status).toBe('pass');
  });

  it('keeps liveness available during a dependency outage', async () => {
    const dependencies = healthyDependencies();
    dependencies.redis = vi.fn().mockRejectedValue(new Error('Redis unavailable'));
    const client = healthClient(dependencies);

    const response = await client.get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'pass', checks: [] });
  });

  it('does not corrupt or throw for a projected event when Redis realtime publishing fails', async () => {
    mockPublish.mockRejectedValueOnce(new Error('Redis unavailable'));
    const before = structuredClone(projectionEvent);

    await expect(publishProjection(projectionEvent)).resolves.toBeUndefined();
    expect(projectionEvent).toEqual(before);
    expect(mockLoggerError).toHaveBeenCalledOnce();

    mockPublish.mockResolvedValueOnce(1);
    await expect(publishProjection(projectionEvent)).resolves.toBeUndefined();
    expect(mockPublish).toHaveBeenCalledTimes(2);
    const [, payload] = mockPublish.mock.calls[1] as [string, string];
    expect(JSON.parse(payload)).toMatchObject({
      txHash: projectionEvent.txHash,
      topic: projectionEvent.topic,
      data: projectionEvent.value,
    });
  });
});
