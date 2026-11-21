import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { env } from '../../config/env.js';
import {
  getMetrics,
  recordRequest,
  recordError,
  recordSlowQuery,
  recordPoolSaturation,
  recordRetentionPruned,
  recordUnknownEvent,
  recordIndexerLedgerProcessed,
  metricsController,
} from './metrics.js';
import { registry } from './prometheus.js';

vi.mock('../../db/redis.js', () => ({
  redis: {
    status: 'ready',
    info: vi.fn().mockResolvedValue('redis stats'),
  },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    $disconnect: [],
    notificationDelivery: { groupBy: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('metrics (issue #1045)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordRequest increments request count', () => {
    recordRequest(100);
    recordRequest(200);

    expect(true).toBe(true);
  });

  it('recordError increments error count', () => {
    recordError();
    recordError();

    expect(true).toBe(true);
  });

  it('getMetrics returns valid metrics structure', async () => {
    const metrics = await getMetrics();

    expect(metrics).toHaveProperty('timestamp');
    expect(metrics).toHaveProperty('service', 'stellar-tipz-backend');
    expect(metrics).toHaveProperty('uptime');
    expect(metrics).toHaveProperty('process');
    expect(metrics).toHaveProperty('redis');
    expect(metrics).toHaveProperty('http');
    expect(metrics).toHaveProperty('database');
  });

  it('getMetrics includes process memory info', async () => {
    const metrics = await getMetrics();

    expect(metrics.process.memory).toHaveProperty('rss');
    expect(metrics.process.memory).toHaveProperty('heapTotal');
    expect(metrics.process.memory).toHaveProperty('heapUsed');
    expect(metrics.process.memory).toHaveProperty('external');
  });

  it('getMetrics includes process CPU info', async () => {
    const metrics = await getMetrics();

    expect(metrics.process.cpu).toHaveProperty('user');
    expect(metrics.process.cpu).toHaveProperty('system');
  });

  function jsonRequest(headers: Record<string, string> = {}): Request {
    return { headers, accepts: () => 'application/json' } as unknown as Request;
  }

  function scrapeRequest(headers: Record<string, string> = {}): Request {
    return { headers, accepts: () => 'text/plain' } as unknown as Request;
  }

  function mockResponse() {
    const res = {
      set: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
    return res as unknown as Response & typeof res;
  }

  it('metricsController keeps the JSON report behind Accept: application/json', async () => {
    const res = mockResponse();

    await metricsController(jsonRequest(), res);

    expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ service: 'stellar-tipz-backend' }));
  });

  it('metricsController serves the Prometheus exposition format by default (issue #1346)', async () => {
    const res = mockResponse();
    recordSlowQuery();

    await metricsController(scrapeRequest(), res);

    expect(res.set).toHaveBeenCalledWith('Content-Type', expect.stringContaining('text/plain'));
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    const body = res.send.mock.calls[0][0] as string;
    expect(body).toContain('# TYPE tipz_db_slow_queries_total counter');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('metricsController requires the bearer token when METRICS_BEARER_TOKEN is set', async () => {
    const token = 'scrape-token-0123456789abcdef';
    const original = env.METRICS_BEARER_TOKEN;
    (env as { METRICS_BEARER_TOKEN?: string }).METRICS_BEARER_TOKEN = token;
    try {
      const denied = mockResponse();
      await metricsController(scrapeRequest(), denied);
      expect(denied.status).toHaveBeenCalledWith(401);
      expect(denied.set).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');

      const allowed = mockResponse();
      await metricsController(scrapeRequest({ authorization: `Bearer ${token}` }), allowed);
      expect(allowed.status).not.toHaveBeenCalled();
      expect(allowed.send).toHaveBeenCalled();
    } finally {
      (env as { METRICS_BEARER_TOKEN?: string }).METRICS_BEARER_TOKEN = original;
    }
  });

  it('metricsController hides the public route in production without a token', async () => {
    const original = env.NODE_ENV;
    (env as { NODE_ENV: string }).NODE_ENV = 'production';
    try {
      const res = mockResponse();
      await metricsController(scrapeRequest(), res);
      expect(res.status).toHaveBeenCalledWith(404);
    } finally {
      (env as { NODE_ENV: string }).NODE_ENV = original;
    }
  });

  it('metricsController handles errors gracefully', async () => {
    const res = mockResponse();
    vi.spyOn(process, 'memoryUsage').mockImplementationOnce(() => {
      throw new Error('Test error');
    });

    await metricsController(jsonRequest(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('mirrors the legacy counters into Prometheus metrics (issue #1346)', async () => {
    registry.resetMetrics();
    recordSlowQuery();
    recordSlowQuery();
    recordPoolSaturation();
    recordRetentionPruned('Notification', 40);
    recordRetentionPruned('Notification', 2);
    recordUnknownEvent();
    recordIndexerLedgerProcessed(12345);

    const text = await registry.metrics();
    expect(text).toContain('tipz_db_slow_queries_total 2');
    expect(text).toContain('tipz_db_pool_saturation_total 1');
    expect(text).toContain('tipz_retention_rows_pruned_total{model="Notification"} 42');
    expect(text).toContain('tipz_indexer_unknown_events_total 1');
    expect(text).toContain('tipz_indexer_last_processed_ledger 12345');
  });
});
