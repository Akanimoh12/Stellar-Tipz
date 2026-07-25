import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import {
  getCachedXMetrics,
  fetchAndRefreshXMetrics,
  refreshXMetrics,
  X_METRICS_CACHE_TTL_SECONDS,
  X_METRICS_FRESHNESS_TTL_MS,
} from './x.service.js';
import { logger } from '../../common/utils/logger.js';

const {
  mockXAccountFindUnique,
  mockXAccountUpsert,
  mockUserFindMany,
  mockRedisGet,
  mockRedisSet,
  mockGetUserByHandle,
} = vi.hoisted(() => ({
  mockXAccountFindUnique: vi.fn(),
  mockXAccountUpsert: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockGetUserByHandle: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    xAccount: {
      findUnique: mockXAccountFindUnique,
      upsert: mockXAccountUpsert,
    },
    user: { findMany: mockUserFindMany },
    $disconnect: vi.fn(),
  },
}));

vi.mock('../../db/redis.js', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    on: vi.fn(),
  },
}));

vi.mock('./x.client.js', () => ({
  xApiClient: {
    getUserByHandle: mockGetUserByHandle,
  },
}));

describe('getCachedXMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  it('returns cached metrics from Redis without querying the database', async () => {
    const cached = {
      handle: 'creator123',
      followers: 1500,
      engagement: 85.3,
      fetchedAt: '2026-07-24T12:00:00.000Z',
    };
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(cached));

    const result = await getCachedXMetrics('creator123');

    expect(result).toEqual(cached);
    expect(mockXAccountFindUnique).not.toHaveBeenCalled();
  });

  it('queries the database on cache miss and caches the result', async () => {
    const fetchedAt = new Date('2026-07-24T12:00:00.000Z');
    mockXAccountFindUnique.mockResolvedValue({
      handle: 'creator123',
      followers: 1500,
      engagement: 85.3,
      fetchedAt,
    });

    const result = await getCachedXMetrics('creator123');

    expect(result).toEqual({
      handle: 'creator123',
      followers: 1500,
      engagement: 85.3,
      fetchedAt: fetchedAt.toISOString(),
    });
    expect(mockRedisSet).toHaveBeenCalledWith(
      'x:metrics:handle:creator123',
      expect.any(String),
      'EX',
      X_METRICS_CACHE_TTL_SECONDS,
    );
  });

  it('throws NotFoundError when handle does not exist in the database', async () => {
    mockXAccountFindUnique.mockResolvedValue(null);

    await expect(getCachedXMetrics('unknown')).rejects.toThrow('X handle "unknown" not found');
  });

  it('returns cached metrics when handle casing differs', async () => {
    const cached = {
      handle: 'Creator123',
      followers: 500,
      engagement: null,
      fetchedAt: '2026-07-24T12:00:00.000Z',
    };
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(cached));

    const result = await getCachedXMetrics('CREATOR123');

    expect(result).toEqual(cached);
  });

  it('handles null engagement gracefully', async () => {
    const fetchedAt = new Date('2026-07-24T12:00:00.000Z');
    mockXAccountFindUnique.mockResolvedValue({
      handle: 'lurker',
      followers: 100,
      engagement: null,
      fetchedAt,
    });

    const result = await getCachedXMetrics('lurker');

    expect(result.engagement).toBeNull();
  });

  it('logs a warning and falls back to database on cache read error', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    mockRedisGet.mockRejectedValueOnce(new Error('Redis down'));
    const fetchedAt = new Date('2026-07-24T12:00:00.000Z');
    mockXAccountFindUnique.mockResolvedValue({
      handle: 'creator123',
      followers: 1500,
      engagement: 85.3,
      fetchedAt,
    });

    const result = await getCachedXMetrics('creator123');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), handle: 'creator123' }),
      'X metrics cache read failed',
    );
    expect(result.followers).toBe(1500);
    warnSpy.mockRestore();
  });
});

describe('fetchAndRefreshXMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  it('returns cached metrics from Redis without any DB or API calls', async () => {
    const cached = {
      handle: 'creator123',
      followers: 1500,
      engagement: 85.3,
      fetchedAt: '2026-07-24T12:00:00.000Z',
    };
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(cached));

    const result = await fetchAndRefreshXMetrics('creator123');

    expect(result).toEqual(cached);
    expect(mockXAccountFindUnique).not.toHaveBeenCalled();
    expect(mockGetUserByHandle).not.toHaveBeenCalled();
  });

  it('returns fresh DB record without calling the API when fetchedAt is within freshness TTL', async () => {
    const freshDate = new Date(Date.now() - 60_000);
    mockXAccountFindUnique.mockResolvedValue({
      handle: 'creator123',
      followers: 1500,
      engagement: 85.3,
      fetchedAt: freshDate,
    });

    const result = await fetchAndRefreshXMetrics('creator123');

    expect(result.followers).toBe(1500);
    expect(mockGetUserByHandle).not.toHaveBeenCalled();
    expect(mockRedisSet).toHaveBeenCalled();
  });

  it('calls the X API when DB record is stale and persists the result', async () => {
    const staleDate = new Date(Date.now() - X_METRICS_FRESHNESS_TTL_MS - 60_000);
    mockXAccountFindUnique.mockResolvedValue({
      handle: 'creator123',
      followers: 500,
      engagement: 10.5,
      fetchedAt: staleDate,
    });
    mockGetUserByHandle.mockResolvedValue({
      data: {
        id: '123',
        name: 'Creator',
        username: 'creator123',
        public_metrics: {
          followers_count: 2000,
          following_count: 300,
          tweet_count: 800,
          listed_count: 15,
        },
      },
    });
    mockXAccountUpsert.mockResolvedValue({});

    const result = await fetchAndRefreshXMetrics('creator123');

    expect(result.followers).toBe(2000);
    expect(result.engagement).toBe(0.4);
    expect(mockGetUserByHandle).toHaveBeenCalledWith('creator123');
    expect(mockXAccountUpsert).toHaveBeenCalledWith({
      where: { handle: 'creator123' },
      update: expect.objectContaining({ followers: 2000 }),
      create: expect.objectContaining({ handle: 'creator123', followers: 2000 }),
    });
  });

  it('calls the X API when handle does not exist in DB and persists the result', async () => {
    mockXAccountFindUnique.mockResolvedValue(null);
    mockGetUserByHandle.mockResolvedValue({
      data: {
        id: '456',
        name: 'New Creator',
        username: 'newcreator',
        public_metrics: {
          followers_count: 100,
          following_count: 10,
          tweet_count: 5,
          listed_count: 0,
        },
      },
    });
    mockXAccountUpsert.mockResolvedValue({});

    const result = await fetchAndRefreshXMetrics('newcreator');

    expect(result.followers).toBe(100);
    expect(result.engagement).toBe(0.05);
    expect(mockXAccountUpsert).toHaveBeenCalledWith({
      where: { handle: 'newcreator' },
      update: expect.objectContaining({ followers: 100 }),
      create: expect.objectContaining({ handle: 'newcreator', followers: 100 }),
    });
  });

  it('returns stale DB data when X API call fails and DB record exists', async () => {
    const staleDate = new Date(Date.now() - X_METRICS_FRESHNESS_TTL_MS - 60_000);
    mockXAccountFindUnique.mockResolvedValue({
      handle: 'creator123',
      followers: 500,
      engagement: 10.5,
      fetchedAt: staleDate,
    });
    mockGetUserByHandle.mockRejectedValue(new Error('API rate limited'));

    const result = await fetchAndRefreshXMetrics('creator123');

    expect(result.followers).toBe(500);
    expect(mockRedisSet).toHaveBeenCalled();
  });

  it('throws when X API call fails and no DB record exists', async () => {
    mockXAccountFindUnique.mockResolvedValue(null);
    mockGetUserByHandle.mockRejectedValue(new Error('API unavailable'));

    await expect(fetchAndRefreshXMetrics('unknown')).rejects.toThrow(
      'Failed to fetch X metrics for "unknown"',
    );
  });

  it('computes null engagement when followers_count is 0', async () => {
    mockXAccountFindUnique.mockResolvedValue(null);
    mockGetUserByHandle.mockResolvedValue({
      data: {
        id: '789',
        name: 'Zero',
        username: 'zero_followers',
        public_metrics: {
          followers_count: 0,
          following_count: 0,
          tweet_count: 0,
          listed_count: 0,
        },
      },
    });
    mockXAccountUpsert.mockResolvedValue({});

    const result = await fetchAndRefreshXMetrics('zero_followers');

    expect(result.engagement).toBeNull();
  });
});

describe('refreshXMetrics (scheduled job)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  it('iterates over linked X handles and refreshes each one', async () => {
    mockUserFindMany.mockResolvedValue([
      { xHandle: 'alice' },
      { xHandle: 'bob' },
    ]);
    mockXAccountFindUnique.mockResolvedValue(null);
    mockGetUserByHandle.mockResolvedValue({
      data: {
        id: '1',
        name: 'Alice',
        username: 'alice',
        public_metrics: { followers_count: 100, following_count: 10, tweet_count: 20, listed_count: 1 },
      },
    });
    mockGetUserByHandle.mockResolvedValueOnce({
      data: {
        id: '2',
        name: 'Bob',
        username: 'bob',
        public_metrics: { followers_count: 200, following_count: 20, tweet_count: 40, listed_count: 2 },
      },
    });
    mockXAccountUpsert.mockResolvedValue({});

    await refreshXMetrics();

    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { xHandle: { not: null }, deletedAt: null },
      select: { xHandle: true },
    });
    expect(mockGetUserByHandle).toHaveBeenCalledTimes(2);
  });

  it('does nothing when no linked X handles exist', async () => {
    mockUserFindMany.mockResolvedValue([]);

    await refreshXMetrics();

    expect(mockGetUserByHandle).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/x/:handle/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  it('returns 200 with metrics for an existing handle', async () => {
    const fetchedAt = new Date('2026-07-24T12:00:00.000Z');
    mockXAccountFindUnique.mockResolvedValue({
      handle: 'creator123',
      followers: 1500,
      engagement: 85.3,
      fetchedAt,
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/x/creator123/metrics');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      handle: 'creator123',
      followers: 1500,
      engagement: 85.3,
      fetchedAt: fetchedAt.toISOString(),
    });
  });

  it('returns 404 when handle does not exist', async () => {
    mockXAccountFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/x/unknown/metrics');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for an empty handle', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/x//metrics');

    expect(res.status).toBe(404);
  });
});

describe('Verify X Ownership (#974)', () => {
  it('should return true for a valid signed code', async () => {
    const { verifyXOwnership } = await import('./x.service.js');
    const handle = 'creator123';
    const validCode = `tipz-${handle}`;
    const result = await verifyXOwnership(handle, validCode);
    expect(result).toBe(true);
  });

  it('should return false for an invalid signed code', async () => {
    const { verifyXOwnership } = await import('./x.service.js');
    const handle = 'creator123';
    const invalidCode = 'wrong-code';
    const result = await verifyXOwnership(handle, invalidCode);
    expect(result).toBe(false);
  });

  it('should throw an error if handle or code is missing', async () => {
    const { verifyXOwnership } = await import('./x.service.js');
    await expect(verifyXOwnership('', 'code')).rejects.toThrow('Handle and signed code are required');
    await expect(verifyXOwnership('handle', '')).rejects.toThrow('Handle and signed code are required');
  });
});
