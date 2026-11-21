import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTipFindMany,
  mockUserFindMany,
  mockUserFindUnique,
  mockCacheGet,
  mockCacheSet,
} = vi.hoisted(() => ({
  mockTipFindMany: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    tip: { findMany: mockTipFindMany },
    user: { findMany: mockUserFindMany, findUnique: mockUserFindUnique },
  },
}));

vi.mock('../../common/utils/cache.js', () => ({
  cacheGetJSON: mockCacheGet,
  cacheSetJSON: mockCacheSet,
}));

import {
  computeTrendingScores,
  rankAddresses,
  isExcludedCreator,
  rankByOverlap,
  getTrending,
  getSimilar,
} from './discovery.service.js';

const HALFLIFE = 7;

describe('computeTrendingScores', () => {
  it('weights recent tips more heavily than older ones', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const hourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const hourScore = [...computeTrendingScores([{ toAddress: 'GA', amountStroops: BigInt(100), createdAt: hourAgo }], now, HALFLIFE).values()][0];
    const weekScore = [...computeTrendingScores([{ toAddress: 'GA', amountStroops: BigInt(100), createdAt: weekAgo }], now, HALFLIFE).values()][0];

    // A tip from an hour ago should be worth ~2x a tip a full half-life (week) older.
    expect(hourScore).toBeGreaterThan(99);
    expect(weekScore).toBeCloseTo(50, 0);
    expect(hourScore / weekScore).toBeGreaterThan(1.9);
  });

  it('returns zero score for no tips', () => {
    expect(computeTrendingScores([], new Date(), HALFLIFE).size).toBe(0);
  });
});

describe('rankAddresses', () => {
  it('ranks by score descending and is deterministic on ties', () => {
    const scores = new Map([
      ['GC', 5],
      ['GB', 10],
      ['GA', 10],
    ]);
    const ranked = rankAddresses(scores, 50);
    expect(ranked).toEqual(['GA', 'GB', 'GC']);
  });

  it('respects topN', () => {
    const scores = new Map([
      ['GA', 3],
      ['GB', 2],
      ['GC', 1],
    ]);
    expect(rankAddresses(scores, 2)).toEqual(['GA', 'GB']);
  });
});

describe('isExcludedCreator', () => {
  it('excludes deactivated, blocked, flagged or deleted creators', () => {
    expect(isExcludedCreator({ deletedAt: null, deactivatedAt: new Date(), blockedAt: null, flaggedUnverified: false })).toBe(true);
    expect(isExcludedCreator({ deletedAt: null, deactivatedAt: null, blockedAt: new Date(), flaggedUnverified: false })).toBe(true);
    expect(isExcludedCreator({ deletedAt: null, deactivatedAt: null, blockedAt: null, flaggedUnverified: true })).toBe(true);
    expect(isExcludedCreator({ deletedAt: null, deactivatedAt: null, blockedAt: null, flaggedUnverified: false })).toBe(false);
  });
});

describe('rankByOverlap', () => {
  it('ranks creators by number of shared supporters', () => {
    const supporters = new Set(['S1', 'S2', 'S3']);
    const tips = [
      { toAddress: 'GA', fromAddress: 'S1' },
      { toAddress: 'GA', fromAddress: 'S2' },
      { toAddress: 'GB', fromAddress: 'S1' },
      { toAddress: 'GC', fromAddress: 'S1' },
      { toAddress: 'GC', fromAddress: 'S2' },
      { toAddress: 'GC', fromAddress: 'S3' },
    ];
    const ranked = rankByOverlap(supporters, tips, 10);
    expect(ranked.map((r) => r.address)).toEqual(['GC', 'GA', 'GB']);
    expect(ranked[0]).toMatchObject({ address: 'GC', shared: 3 });
  });

  it('ignores tips outside the supporter set and self-tips', () => {
    const supporters = new Set(['S1']);
    const tips = [
      { toAddress: 'GA', fromAddress: 'S1' },
      { toAddress: 'GA', fromAddress: 'S9' },
      { toAddress: 'GA', fromAddress: 'GA' },
    ];
    const ranked = rankByOverlap(supporters, tips, 10);
    expect(ranked).toEqual([{ address: 'GA', shared: 1, total: 1 }]);
  });
});

describe('getTrending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('serves empty list with stale flag when source is unavailable', async () => {
    mockTipFindMany.mockRejectedValue(new Error('db down'));
    const res = await getTrending(20, 0);
    expect(res.stale).toBe(true);
    expect(res.data).toEqual([]);
  });

  it('excludes ineligible creators from the ranking', async () => {
    mockTipFindMany.mockResolvedValue([
      { toAddress: 'GA', amountStroops: BigInt(100), createdAt: new Date() },
      { toAddress: 'GB', amountStroops: BigInt(100), createdAt: new Date() },
    ]);
    mockUserFindMany.mockResolvedValueOnce([
      { id: '1', username: 'alice', stellarAddress: 'GA', displayName: null, imageUrl: null, avatarCid: null },
    ]);

    const res = await getTrending(20, 0);
    expect(res.stale).toBe(false);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].stellarAddress).toBe('GA');
  });
});

describe('getSimilar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('returns empty data when creator has no supporters', async () => {
    mockUserFindUnique.mockResolvedValue({ id: '1', stellarAddress: 'GA' });
    mockTipFindMany.mockResolvedValueOnce([]); // no supporters
    const res = await getSimilar('alice', 20);
    expect(res.stale).toBe(false);
    expect(res.data).toEqual([]);
  });

  it('returns 404 when creator does not exist', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    await expect(getSimilar('ghost', 20)).rejects.toThrow();
  });
});
