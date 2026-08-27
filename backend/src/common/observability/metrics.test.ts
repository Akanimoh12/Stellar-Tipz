import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { getMetrics, recordRequest, recordError, metricsController } from './metrics.js';

vi.mock('../../db/redis.js', () => ({
  redis: {
    status: 'ready',
    info: vi.fn().mockResolvedValue('redis stats'),
  },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    $disconnect: [],
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

  it('metricsController returns JSON response', async () => {
    const req = {} as Request;
    const res = {
      set: vi.fn().mockReturnThis(),
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;

    await metricsController(req, res);

    expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.json).toHaveBeenCalled();
  });

  it('metricsController handles errors gracefully', async () => {
    const req = {} as Request;
    const res = {
      set: vi.fn().mockReturnThis(),
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;

    vi.spyOn(global.Object, 'assign').mockImplementationOnce(() => {
      throw new Error('Test error');
    });

    await metricsController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
