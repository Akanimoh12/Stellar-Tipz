import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { searchCreators } from './search.service.js';

const { mockFindMany, mockCount, mockQueryRaw, mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findMany: mockFindMany, count: mockCount },
    $queryRaw: mockQueryRaw,
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

describe('GET /api/v1/search/creators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockQueryRaw.mockResolvedValue([]);
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  it('returns 400 when q is missing', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when q is empty', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=');
    expect(res.status).toBe(400);
  });

  it('returns matching creators with relevance sort (default)', async () => {
    mockQueryRaw.mockResolvedValue([
      {
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice Star',
        stellarAddress: 'GA1',
        imageUrl: null,
        bio: null,
      },
    ]);
    mockCount.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=alice');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].username).toBe('alice');
    expect(res.body.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 1,
      hasMore: false,
    });
  });

  it('applies limit and offset pagination', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(10);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=test&limit=5&offset=5&sort=recent');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      limit: 5,
      offset: 5,
      total: 10,
      hasMore: true,
    });
  });

  it('returns 400 for invalid limit', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=test&limit=0');
    expect(res.status).toBe(400);
  });

  it('returns 400 for limit exceeding max', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=test&limit=100');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid sort value', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=alice&sort=invalid');
    expect(res.status).toBe(400);
  });

  it('uses relevance ranking when sort=relevance', async () => {
    mockQueryRaw.mockResolvedValue([
      {
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice Star',
        stellarAddress: 'GA1',
        imageUrl: null,
        bio: 'Alice bio',
      },
    ]);
    mockCount.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=alice&sort=relevance');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockQueryRaw).toHaveBeenCalled();
  });

  it('uses recent sort when sort=recent', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const app = createApp();
    await request(app).get('/api/v1/search/creators?q=test&sort=recent');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }],
      }),
    );
  });
  it('returns 400 for a negative offset', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=test&offset=-1');
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-numeric limit', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=test&limit=abc');
    expect(res.status).toBe(400);
  });

  it('applies default limit and offset when omitted', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=test');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 0,
      hasMore: false,
    });
  });

  it('matches creators by displayName as well as username', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'user-2',
        username: 'bstar99',
        displayName: 'Bob Star',
        stellarAddress: 'GA2',
        imageUrl: null,
        bio: null,
      },
    ]);
    mockCount.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=Star');

    expect(res.status).toBe(200);
    expect(res.body.data[0].displayName).toBe('Bob Star');
  });
});

describe('searchCreators service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  it('queries with correct where clause for recent sort', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await searchCreators('bob', 20, 0, 'recent');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          OR: [
            { username: { contains: 'bob', mode: 'insensitive' } },
            { displayName: { contains: 'bob', mode: 'insensitive' } },
          ],
        }),
        orderBy: [{ createdAt: 'desc' }],
        take: 20,
        skip: 0,
      }),
    );
  });
});

describe('searchCreators caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries the database and caches the result on a cache miss', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([
      {
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice Star',
        stellarAddress: 'GA1',
        imageUrl: null,
        bio: null,
      },
    ]);
    mockCount.mockResolvedValue(1);

    const result = await searchCreators('alice', 20, 0);

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockRedisSet).toHaveBeenCalledWith(
      'search:creators:alice:20:0',
      JSON.stringify(result),
      'EX',
      expect.any(Number),
    );
  });

  it('returns the cached result without hitting the database on a cache hit', async () => {
    const cached = {
      data: [
        {
          id: 'user-1',
          username: 'alice',
          displayName: 'Alice Star',
          stellarAddress: 'GA1',
          imageUrl: null,
          bio: null,
        },
      ],
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
    };
    mockRedisGet.mockResolvedValue(JSON.stringify(cached));

    const result = await searchCreators('alice', 20, 0);

    expect(result).toEqual(cached);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('normalizes the query casing and surrounding whitespace for the cache key', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await searchCreators('  Alice  ', 20, 0);

    expect(mockRedisGet).toHaveBeenCalledWith('search:creators:alice:20:0');
  });

  it('keys the cache separately per limit/offset combination', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await searchCreators('alice', 5, 10);

    expect(mockRedisGet).toHaveBeenCalledWith('search:creators:alice:5:10');
  });

  it('falls back to the database when the cache read fails', async () => {
    mockRedisGet.mockRejectedValue(new Error('redis unavailable'));
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const result = await searchCreators('alice', 20, 0);

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual([]);
  });

  it('still returns a result when the cache write fails', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockRejectedValue(new Error('redis unavailable'));
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const result = await searchCreators('alice', 20, 0);

    expect(result.pagination.total).toBe(0);
  });
});

describe('GET /api/v1/search/creators/trending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  it('returns trending creators ordered by received tips', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice Star',
        stellarAddress: 'GA1',
        imageUrl: null,
        bio: null,
      },
    ]);
    mockCount.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators/trending');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].username).toBe('alice');
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { receivedTips: { _count: 'desc' } },
      }),
    );
  });

  it('applies limit and offset pagination', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(10);

    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators/trending?limit=5&offset=5');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      limit: 5,
      offset: 5,
      total: 10,
      hasMore: true,
    });
  });

  it('returns 400 for invalid limit', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators/trending?limit=0');
    expect(res.status).toBe(400);
  });
});

describe('getTrendingCreators service caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries the database and caches the result on a cache miss', async () => {
    mockRedisGet.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const { getTrendingCreators } = await import('./search.service.js');
    await getTrendingCreators(20, 0);

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockRedisSet).toHaveBeenCalledWith(
      'search:trending:20:0',
      expect.any(String),
      'EX',
      expect.any(Number),
    );
  });
});
