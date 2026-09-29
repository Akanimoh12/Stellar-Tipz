/**
 * Live Redis tests for search caching (issue #1267): the real Lua scripts for
 * the epoch-guarded store and the fill lock. Skipped unless TEST_REDIS_URL is
 * set — see common/testing/liveServices.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_REDIS_URL, useLiveServices } from '../../common/testing/liveServices.js';

useLiveServices();

const { mockQueryRaw, mockCount } = vi.hoisted(() => ({ mockQueryRaw: vi.fn(), mockCount: vi.fn() }));
vi.mock('../../db/prisma.js', () => ({
  prisma: { $queryRaw: mockQueryRaw, user: { count: mockCount, findMany: vi.fn() } },
}));

const { redis } = await import('../../db/redis.js');
const { searchCreators } = await import('./search.service.js');
const { creatorSearchKey, invalidateCreatorSearch, SEARCH_EPOCH_KEY } = await import('./search.cache.js');

const alice = { id: 'u1', username: 'alice', displayName: 'Alice', stellarAddress: 'GA', imageUrl: null, bio: null };

describe.skipIf(!TEST_REDIS_URL)('search cache on Redis (live)', () => {
  beforeAll(async () => {
    if (redis.status !== 'ready') await new Promise((resolve) => redis.once('ready', resolve));
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([alice]);
    mockCount.mockResolvedValue(1);
    const keys = await redis.keys('search:{search}:*');
    if (keys.length > 0) await redis.del(...keys);
  });
  afterAll(async () => {
    await redis.quit();
  });

  it('stores fills, indexes them, and invalidates only affected queries', async () => {
    await searchCreators('ali', 20, 0);
    await searchCreators('bob', 20, 0);
    await searchCreators('ali', 20, 0); // hit
    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    expect(await redis.get(`${creatorSearchKey('ali', 20, 0, 'relevance')}:lock`)).toBeNull(); // lock released

    await invalidateCreatorSearch(['Alice']);

    expect(await redis.get(creatorSearchKey('ali', 20, 0, 'relevance'))).toBeNull();
    expect(await redis.get(creatorSearchKey('bob', 20, 0, 'relevance'))).not.toBeNull();
  });

  it('refuses to store a fill that raced a profile write', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockQueryRaw.mockImplementationOnce(async () => {
      await gate;
      return [alice];
    });

    const inFlight = searchCreators('alice', 20, 0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await invalidateCreatorSearch(['alice']);
    release();
    await inFlight;

    expect(Number(await redis.get(SEARCH_EPOCH_KEY))).toBeGreaterThan(0);
    expect(await redis.get(creatorSearchKey('alice', 20, 0, 'relevance'))).toBeNull();
  });
});
