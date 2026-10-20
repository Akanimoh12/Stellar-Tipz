import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRedis } from '../../common/testing/fakeRedis.js';

const { redisHolder } = vi.hoisted(() => ({ redisHolder: { current: null as unknown } }));

vi.mock('../../db/redis.js', () => ({
  get redis() {
    return redisHolder.current;
  },
}));

const {
  ANALYTICS_CACHE_TTL_SECONDS,
  ANALYTICS_ROLLUP_CACHE_TTL_SECONDS,
  cachedAnalytics,
  invalidateCreatorAnalytics,
  invalidateRollupAnalytics,
} = await import('./analytics.cache.js');
const { RELEASE_LOCK_SCRIPT } = await import('../../common/utils/cache.js');

let redis: FakeRedis;

beforeEach(() => {
  redis = new FakeRedis();
  redis.defineScript(RELEASE_LOCK_SCRIPT, ([key], [token], r) => (r.peek(key) === token ? r.remove(key) : 0));
  redisHolder.current = redis;
});

function counter<T>(value: T) {
  return vi.fn(async () => value);
}

describe('cachedAnalytics (issue #1265)', () => {
  it('serves repeat queries from the cache', async () => {
    const run = counter({ total: 1 });

    await cachedAnalytics({ kind: 'platform' }, 'volume', { granularity: 'day' }, run);
    await expect(cachedAnalytics({ kind: 'platform' }, 'volume', { granularity: 'day' }, run)).resolves.toEqual({ total: 1 });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keys every parameter, so different queries never share an entry', async () => {
    const run = counter('x');

    await cachedAnalytics({ kind: 'platform' }, 'volume', { granularity: 'day' }, run);
    await cachedAnalytics({ kind: 'platform' }, 'volume', { granularity: 'week' }, run);
    await cachedAnalytics({ kind: 'platform' }, 'volume', { granularity: 'day', startDate: '2026-01-01' }, run);
    await cachedAnalytics({ kind: 'platform' }, 'top-tippers', { granularity: 'day' }, run);
    await cachedAnalytics({ kind: 'creator', address: 'GA' }, 'creator', { granularity: 'day' }, run);
    await cachedAnalytics({ kind: 'creator', address: 'GB' }, 'creator', { granularity: 'day' }, run);

    expect(run).toHaveBeenCalledTimes(6);
  });

  it('uses the documented TTL per scope', async () => {
    const frozen = Date.now();
    redis.now = () => frozen;
    await cachedAnalytics({ kind: 'rollup' }, 'summary', {}, counter(1));
    await cachedAnalytics({ kind: 'platform' }, 'volume', {}, counter(2));

    const ttls = await Promise.all(
      redis.keys().filter((key) => !key.includes(':gen:')).map((key) => redis.pttl(key)),
    );
    expect(ttls.sort((a, b) => a - b)).toEqual([
      ANALYTICS_CACHE_TTL_SECONDS * 1000,
      ANALYTICS_ROLLUP_CACHE_TTL_SECONDS * 1000,
    ]);
    expect(ANALYTICS_CACHE_TTL_SECONDS).toBe(60);
    expect(ANALYTICS_ROLLUP_CACHE_TTL_SECONDS).toBe(300);
  });

  it('runs one fill for a stampede of identical requests', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const run = vi.fn(async () => {
      await gate;
      return 'rows';
    });

    const burst = Array.from({ length: 30 }, () => cachedAnalytics({ kind: 'platform' }, 'top-tippers', { page: 1 }, run));
    release();
    await Promise.all(burst);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('serves uncached when Redis is down, and invalidation never throws', async () => {
    redis.failWith = new Error('ECONNREFUSED');
    const run = counter('fresh');

    await expect(cachedAnalytics({ kind: 'rollup' }, 'daily', {}, run)).resolves.toBe('fresh');
    await expect(invalidateRollupAnalytics()).resolves.toBeUndefined();
    await expect(invalidateCreatorAnalytics('GA')).resolves.toBeUndefined();
  });
});

describe('analytics cache invalidation (issue #1265)', () => {
  it('a rollup rewrite invalidates rollup and platform entries but not creator entries', async () => {
    const rollup = counter('rollup');
    const platform = counter('platform');
    const creator = counter('creator');
    const all = async () => {
      await cachedAnalytics({ kind: 'rollup' }, 'daily', {}, rollup);
      await cachedAnalytics({ kind: 'platform' }, 'volume', {}, platform);
      await cachedAnalytics({ kind: 'creator', address: 'GA' }, 'creator', {}, creator);
    };

    await all();
    await invalidateRollupAnalytics();
    await all();

    expect(rollup).toHaveBeenCalledTimes(2);
    expect(platform).toHaveBeenCalledTimes(2);
    expect(creator).toHaveBeenCalledTimes(1);
  });

  it("a creator's tip change invalidates only that creator", async () => {
    const creatorA = counter('a');
    const creatorB = counter('b');

    await cachedAnalytics({ kind: 'creator', address: 'GA' }, 'creator', {}, creatorA);
    await cachedAnalytics({ kind: 'creator', address: 'GB' }, 'creator', {}, creatorB);
    await invalidateCreatorAnalytics('GA');
    await cachedAnalytics({ kind: 'creator', address: 'GA' }, 'creator', {}, creatorA);
    await cachedAnalytics({ kind: 'creator', address: 'GB' }, 'creator', {}, creatorB);

    expect(creatorA).toHaveBeenCalledTimes(2);
    expect(creatorB).toHaveBeenCalledTimes(1);
  });

  it('never serves a result computed before a concurrent invalidation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const stale = vi.fn(async () => {
      await gate;
      return 'before-tip';
    });

    const inFlight = cachedAnalytics({ kind: 'creator', address: 'GA' }, 'creator', {}, stale);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await invalidateCreatorAnalytics('GA'); // a new tip lands while the fill runs
    release();
    await inFlight;

    await expect(
      cachedAnalytics({ kind: 'creator', address: 'GA' }, 'creator', {}, counter('after-tip')),
    ).resolves.toBe('after-tip');
  });
});
