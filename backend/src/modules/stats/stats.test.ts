import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTipCount,
  mockTipAggregate,
  mockUserCount,
  mockCacheGet,
  mockCacheSet,
} = vi.hoisted(() => ({
  mockTipCount: vi.fn(),
  mockTipAggregate: vi.fn(),
  mockUserCount: vi.fn(),
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    tip: { count: mockTipCount, aggregate: mockTipAggregate },
    user: { count: mockUserCount },
  },
}));

vi.mock('../../common/utils/cache.js', () => ({
  cacheGetJSON: mockCacheGet,
  cacheSetJSON: mockCacheSet,
}));

import { getPlatformStats, computePlatformStats } from './stats.service.js';

describe('getPlatformStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('returns computed stats when the source is available', async () => {
    mockTipCount.mockResolvedValueOnce(100).mockResolvedValueOnce(10);
    mockTipAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(5_000) } })
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(500) } });
    mockUserCount.mockResolvedValue(42);

    const res = await getPlatformStats();
    expect(res.stale).toBe(false);
    expect(res.totalTips).toBe(100);
    expect(res.totalVolumeStroops).toBe('5000');
    expect(res.creatorCount).toBe(42);
    expect(res.activity24h).toEqual({ tips: 10, volumeStroops: '500' });
  });

  it('returns nulls with stale flag when the source is unavailable', async () => {
    mockTipCount.mockRejectedValue(new Error('db down'));
    const res = await getPlatformStats();
    expect(res.stale).toBe(true);
    expect(res.totalTips).toBeNull();
    expect(res.creatorCount).toBeNull();
    expect(res.activity24h.tips).toBeNull();
  });

  it('serves from cache without hitting the database', async () => {
    mockCacheGet.mockResolvedValue({
      totalTips: 1,
      totalVolumeStroops: '1',
      creatorCount: 1,
      activity24h: { tips: 1, volumeStroops: '1' },
      generatedAt: new Date().toISOString(),
      stale: false,
    });
    const res = await getPlatformStats();
    expect(mockTipCount).not.toHaveBeenCalled();
    expect(res.totalTips).toBe(1);
  });

  it('computePlatformStats aggregates correctly', async () => {
    mockTipCount.mockResolvedValueOnce(7).mockResolvedValueOnce(3);
    mockTipAggregate
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(100) } })
      .mockResolvedValueOnce({ _sum: { amountStroops: BigInt(40) } });
    mockUserCount.mockResolvedValue(5);
    const stats = await computePlatformStats();
    expect(stats).toMatchObject({
      totalTips: 7,
      totalVolumeStroops: '100',
      creatorCount: 5,
      activity24h: { tips: 3, volumeStroops: '40' },
      stale: false,
    });
  });
});
