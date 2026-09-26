import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRedis } from '../../common/testing/fakeRedis.js';
import { registry } from '../../common/observability/prometheus.js';

const { mockFindMany, mockCount, mockQueryRaw, redisHolder } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockQueryRaw: vi.fn(),
  redisHolder: { current: null as unknown },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findMany: mockFindMany, count: mockCount },
    $queryRaw: mockQueryRaw,
    $disconnect: vi.fn(),
  },
}));

vi.mock('../../db/redis.js', () => ({
  get redis() {
    return redisHolder.current;
  },
}));

const { createApp } = await import('../../app.js');
const { searchCreators, getTrendingCreators } = await import('./search.service.js');
const {
  STORE_IF_CURRENT_SCRIPT,
  SEARCH_EPOCH_KEY,
  creatorSearchKey,
  invalidateCreatorSearch,
  matchesSearchQuery,
  trendingKey,
} = await import('./search.cache.js');
const { RELEASE_LOCK_SCRIPT } = await import('../../common/utils/cache.js');

let redis: FakeRedis;

/** Fresh fake Redis with JS equivalents of the Lua scripts the search cache runs. */
function freshRedis(): FakeRedis {
  const fake = new FakeRedis();
  fake.defineScript(RELEASE_LOCK_SCRIPT, ([key], [token], r) => (r.peek(key) === token ? r.remove(key) : 0));
  fake.defineScript(
    STORE_IF_CURRENT_SCRIPT,
    ([epochKey, key, indexKey, entriesKey], [epoch, value, ttl, query, score], r) => {
      if ((r.peek(epochKey) ?? '0') !== epoch) return 0;
      r.put(key, value, Number(ttl) * 1000);
      r.addToSet(entriesKey, key);
      r.setTtl(entriesKey, Number(ttl) * 1000);
      if (query !== '') r.addToSortedSet(indexKey, Number(score), query, true);
      return 1;
    },
  );
  return fake;
}

const alice = {
  id: 'user-1',
  username: 'alice',
  displayName: 'Alice Star',
  stellarAddress: 'GA1',
  imageUrl: null,
  bio: null,
};

beforeEach(() => {
  redis = freshRedis();
  redisHolder.current = redis;
});

describe('GET /api/v1/search/creators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockQueryRaw.mockResolvedValue([]);
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

  it('returns 400 when q is only whitespace', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/search/creators?q=%20%20');
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
    mockQueryRaw.mockResolvedValue([
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

describe('GET /api/v1/search/creators/trending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
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

describe('searchCreators service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockQueryRaw.mockResolvedValue([]);
  });

  it('queries with correct where clause for recent sort', async () => {
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

  it('runs the SQL with the same normalized query that keys the cache', async () => {
    await searchCreators('  Alice  ', 20, 0, 'recent');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { username: { contains: 'alice', mode: 'insensitive' } },
            { displayName: { contains: 'alice', mode: 'insensitive' } },
          ],
        }),
      }),
    );
    expect(await redis.get(creatorSearchKey('alice', 20, 0, 'recent'))).not.toBeNull();
  });
});

describe('searchCreators caching (issue #1267)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(1);
    mockQueryRaw.mockResolvedValue([alice]);
    mockFindMany.mockResolvedValue([alice]);
    registry.resetMetrics();
  });

  it('queries the database on a miss and serves the cached result on a hit', async () => {
    const first = await searchCreators('alice', 20, 0);
    const second = await searchCreators('alice', 20, 0);

    expect(second).toEqual(first);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(await redis.pttl(creatorSearchKey('alice', 20, 0, 'relevance'))).toBeGreaterThan(0);
  });

  it('treats casing and surrounding whitespace as the same query', async () => {
    await searchCreators('alice', 20, 0);
    await searchCreators('  ALICE ', 20, 0);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('keys every parameter, so distinct queries never share an entry', async () => {
    const variants: Array<[string, number, number, 'relevance' | 'recent' | 'popular']> = [
      ['alice', 20, 0, 'relevance'],
      ['alice', 20, 0, 'recent'],
      ['alice', 20, 0, 'popular'],
      ['alice', 5, 0, 'relevance'],
      ['alice', 20, 5, 'relevance'],
      ['alic', 20, 0, 'relevance'],
      // Delimiter-bearing queries that a naive `q:limit:offset:sort` key would collide on.
      ['a:20:0', 20, 0, 'relevance'],
      ['a', 20, 0, 'relevance'],
    ];
    const keys = variants.map((args) => creatorSearchKey(...args));
    expect(new Set(keys).size).toBe(variants.length);

    for (const args of variants) await searchCreators(...args);

    // Each distinct query was a miss: nothing bled across entries.
    expect(mockQueryRaw.mock.calls.length + mockFindMany.mock.calls.length).toBe(variants.length);
  });

  it('never serves one query the cached rows of another', async () => {
    mockQueryRaw.mockResolvedValueOnce([alice]).mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const aliceRows = await searchCreators('alice', 20, 0);
    const bobRows = await searchCreators('bob', 20, 0);

    expect(aliceRows.data).toHaveLength(1);
    expect(bobRows.data).toHaveLength(0);
  });

  it('runs the database query once for a stampede on a popular query', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockQueryRaw.mockImplementation(async () => {
      await gate;
      return [alice];
    });

    const burst = Array.from({ length: 50 }, () => searchCreators('alice', 20, 0));
    release();
    const results = await Promise.all(burst);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.data[0]?.id === 'user-1')).toBe(true);
  });

  it('waits for another instance that holds the fill lock instead of querying', async () => {
    const key = creatorSearchKey('alice', 20, 0, 'relevance');
    await redis.set(`${key}:lock`, 'other-instance', 'PX', 5_000, 'NX');
    const theirs = { data: [alice], pagination: { limit: 20, offset: 0, total: 1, hasMore: false } };
    setTimeout(() => void redis.set(key, JSON.stringify(theirs), 'EX', 60), 20);

    await expect(searchCreators('alice', 20, 0)).resolves.toEqual(theirs);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('exposes hit and miss counts as metrics', async () => {
    await searchCreators('alice', 20, 0);
    await searchCreators('alice', 20, 0);
    await searchCreators('alice', 20, 0);

    const metric = (await registry.getMetricsAsJSON()).find((m) => m.name === 'tipz_cache_requests_total');
    const values = Object.fromEntries(
      (metric?.values ?? [])
        .filter((v) => v.labels.cache === 'search_creators')
        .map((v) => [v.labels.result, v.value]),
    );
    expect(values).toEqual({ miss: 1, hit: 2 });
  });

  it('falls back to the database when Redis is down', async () => {
    redis.failWith = new Error('ECONNREFUSED');

    const result = await searchCreators('alice', 20, 0);

    expect(result.data).toHaveLength(1);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not wait on Redis while the client is reconnecting', async () => {
    Object.assign(redis, { status: 'reconnecting' });
    redis.get = () => new Promise(() => undefined); // a queued command never settles

    await expect(searchCreators('alice', 20, 0)).resolves.toMatchObject({ data: [alice] });
  });
});

describe('search cache invalidation on profile writes (issue #1267)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(1);
    mockQueryRaw.mockResolvedValue([alice]);
    mockFindMany.mockResolvedValue([alice]);
  });

  it('makes a newly registered creator findable immediately', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);
    await expect(searchCreators('ali', 20, 0)).resolves.toMatchObject({ data: [] });

    // Creator "alice" registers.
    await invalidateCreatorSearch([null, 'alice']);

    await expect(searchCreators('ali', 20, 0)).resolves.toMatchObject({ data: [alice] });
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
  });

  it('drops every page and sort order of an affected query', async () => {
    await searchCreators('ali', 20, 0, 'relevance');
    await searchCreators('ali', 20, 20, 'relevance');
    await searchCreators('ali', 20, 0, 'recent');

    await invalidateCreatorSearch(['alice']);

    expect(await redis.get(creatorSearchKey('ali', 20, 0, 'relevance'))).toBeNull();
    expect(await redis.get(creatorSearchKey('ali', 20, 20, 'relevance'))).toBeNull();
    expect(await redis.get(creatorSearchKey('ali', 20, 0, 'recent'))).toBeNull();
  });

  it('matches both the old and the new name on a rename', async () => {
    await searchCreators('alice', 20, 0);
    await searchCreators('zed', 20, 0);

    await invalidateCreatorSearch(['alice', 'Alice Star', 'zed_the_great', null]);

    expect(await redis.get(creatorSearchKey('alice', 20, 0, 'relevance'))).toBeNull();
    expect(await redis.get(creatorSearchKey('zed', 20, 0, 'relevance'))).toBeNull();
  });

  it('keeps unaffected queries cached', async () => {
    await searchCreators('alice', 20, 0);
    await searchCreators('bob', 20, 0);

    await invalidateCreatorSearch(['alice']);

    expect(await redis.get(creatorSearchKey('alice', 20, 0, 'relevance'))).toBeNull();
    expect(await redis.get(creatorSearchKey('bob', 20, 0, 'relevance'))).not.toBeNull();
  });

  it('always drops the trending cache', async () => {
    await getTrendingCreators(20, 0);
    expect(await redis.get(trendingKey(20, 0))).not.toBeNull();

    await invalidateCreatorSearch([]);

    expect(await redis.get(trendingKey(20, 0))).toBeNull();
  });

  it('does not re-cache rows a fill read before a concurrent profile write', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockQueryRaw.mockImplementationOnce(async () => {
      await gate; // rows read before the deactivation below
      return [alice];
    });

    const inFlight = searchCreators('alice', 20, 0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await invalidateCreatorSearch(['alice']); // alice deactivates while the fill is running
    release();
    await inFlight;

    expect(await redis.get(SEARCH_EPOCH_KEY)).toBe('1');
    expect(await redis.get(creatorSearchKey('alice', 20, 0, 'relevance'))).toBeNull();
  });

  it('never throws when Redis is unavailable', async () => {
    redis.failWith = new Error('ECONNREFUSED');
    await expect(invalidateCreatorSearch(['alice'])).resolves.toBeUndefined();
  });
});

describe('matchesSearchQuery', () => {
  it('mirrors ILIKE substring semantics', () => {
    expect(matchesSearchQuery('ali', 'Alice Star')).toBe(true);
    expect(matchesSearchQuery('star', 'Alice Star')).toBe(true);
    expect(matchesSearchQuery('bob', 'Alice Star')).toBe(false);
  });

  it('honours % and _ wildcards and backslash escapes', () => {
    expect(matchesSearchQuery('a_ice', 'alice')).toBe(true);
    expect(matchesSearchQuery('a%star', 'alice star')).toBe(true);
    expect(matchesSearchQuery('a\\_ice', 'alice')).toBe(false);
    expect(matchesSearchQuery('a.c', 'abc')).toBe(false); // regex metacharacters are literal
  });
});
