import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { getDailyAnalytics, getAnalyticsSummary } from './analytics.service.js';

const { mockFindMany, mockCount } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    analyticsDaily: { findMany: mockFindMany, count: mockCount },
    $disconnect: vi.fn(),
  },
}));

describe('GET /api/v1/analytics/daily', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it('returns 200 with empty data by default', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/analytics/daily');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({
      limit: 30,
      offset: 0,
      total: 0,
      hasMore: false,
    });
  });

  it('returns daily analytics entries', async () => {
    mockFindMany.mockResolvedValue([
      {
        date: new Date('2026-07-24'),
        totalTips: 42,
        totalVolume: BigInt(840000000),
        newUsers: 5,
        activeUsers: 18,
      },
    ]);
    mockCount.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get('/api/v1/analytics/daily');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].date).toBe('2026-07-24');
    expect(res.body.data[0].totalTips).toBe(42);
    expect(res.body.data[0].totalVolume).toBe('840000000');
  });

  it('passes date range filters to prisma', async () => {
    const app = createApp();
    await request(app).get(
      '/api/v1/analytics/daily?startDate=2026-07-01&endDate=2026-07-31',
    );

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date: {
            gte: new Date('2026-07-01'),
            lte: new Date('2026-07-31'),
          },
        },
      }),
    );
  });

  it('returns 400 for invalid date format', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/analytics/daily?startDate=invalid');
    expect(res.status).toBe(400);
  });

  it('returns 400 for limit exceeding max', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/analytics/daily?limit=500');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/analytics/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated summary', async () => {
    mockFindMany.mockResolvedValue([
      {
        date: new Date('2026-07-23'),
        totalTips: 10,
        totalVolume: BigInt(200000000),
        newUsers: 2,
        activeUsers: 8,
      },
      {
        date: new Date('2026-07-24'),
        totalTips: 15,
        totalVolume: BigInt(300000000),
        newUsers: 3,
        activeUsers: 12,
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/analytics/summary');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalTips: 25,
      totalVolume: '500000000',
      totalNewUsers: 5,
      totalActiveUsers: 20,
      period: { start: null, end: null },
    });
  });

  it('passes date range to summary', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    await request(app).get(
      '/api/v1/analytics/summary?startDate=2026-07-01&endDate=2026-07-31',
    );

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date: {
            gte: new Date('2026-07-01'),
            lte: new Date('2026-07-31'),
          },
        },
      }),
    );
  });
});

describe('getDailyAnalytics service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports hasMore when additional pages exist', async () => {
    mockFindMany.mockResolvedValue([{ date: new Date(), totalTips: 1, totalVolume: BigInt(0), newUsers: 1, activeUsers: 1 }]);
    mockCount.mockResolvedValue(10);

    const result = await getDailyAnalytics(undefined, undefined, 5, 0);

    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.total).toBe(10);
  });
});
