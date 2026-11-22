import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRedis } from '../testing/fakeRedis.js';
import { registry } from '../observability/prometheus.js';

const { fake } = vi.hoisted(() => ({ fake: { current: null as unknown } }));

vi.mock('../../db/redis.js', () => ({
  get redis() {
    return fake.current;
  },
}));

const { getOrFill, RELEASE_LOCK_SCRIPT } = await import('./cache.js');

type Series = { labels: Record<string, string>; value: number };

async function lookups(cache: string): Promise<Record<string, number>> {
  const metric = (await registry.getMetricsAsJSON()).find((m) => m.name === 'tipz_cache_requests_total');
  const out: Record<string, number> = {};
  for (const s of (metric?.values ?? []) as Series[]) {
    if (s.labels.cache === cache) out[s.labels.result] = s.value;
  }
  return out;
}

let redis: FakeRedis;

beforeEach(() => {
  redis = new FakeRedis();
  redis.defineScript(RELEASE_LOCK_SCRIPT, ([key], [token], r) =>
    r.peek(key) === token ? r.remove(key) : 0,
  );
  fake.current = redis;
  registry.resetMetrics();
});

describe('getOrFill', () => {
  it('fills on a miss, stores with the TTL, then serves hits without refilling', async () => {
    const fill = vi.fn().mockResolvedValue({ n: 1 });

    await expect(getOrFill({ cache: 't', key: 'k', ttlSeconds: 30, fill })).resolves.toEqual({ n: 1 });
    await expect(getOrFill({ cache: 't', key: 'k', ttlSeconds: 30, fill })).resolves.toEqual({ n: 1 });

    expect(fill).toHaveBeenCalledTimes(1);
    expect(await redis.pttl('k')).toBeGreaterThan(29_000);
    expect(await redis.get('k:lock')).toBeNull(); // lock released after the fill
    expect(await lookups('t')).toEqual({ miss: 1, hit: 1 });
  });

  it('runs the fill once for a burst of concurrent misses on one instance', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fill = vi.fn(async () => {
      await gate;
      return { rows: [1, 2, 3] };
    });

    const burst = Array.from({ length: 25 }, () =>
      getOrFill({ cache: 'burst', key: 'popular', ttlSeconds: 30, fill }),
    );
    release();
    const results = await Promise.all(burst);

    expect(fill).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.rows.length === 3)).toBe(true);
    expect(await lookups('burst')).toEqual({ miss: 1, coalesced: 24 });
  });

  it('waits for another instance holding the fill lock instead of querying too', async () => {
    await redis.set('shared:lock', 'other-instance', 'PX', 5_000, 'NX');
    setTimeout(() => void redis.set('shared', JSON.stringify({ from: 'other' }), 'EX', 30), 30);
    const fill = vi.fn().mockResolvedValue({ from: 'me' });

    const value = await getOrFill({ cache: 'x', key: 'shared', ttlSeconds: 30, fill, lockPollMs: 5 });

    expect(value).toEqual({ from: 'other' });
    expect(fill).not.toHaveBeenCalled();
    expect(await lookups('x')).toEqual({ coalesced: 1 });
  });

  it('computes the value itself once the wait budget runs out (crashed lock holder)', async () => {
    await redis.set('stuck:lock', 'dead-instance', 'PX', 5_000, 'NX');
    const fill = vi.fn().mockResolvedValue('fresh');

    const started = Date.now();
    const value = await getOrFill({
      cache: 'stuck',
      key: 'stuck',
      ttlSeconds: 30,
      fill,
      lockWaitMs: 40,
      lockPollMs: 5,
    });

    expect(value).toBe('fresh');
    expect(fill).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(1_000);
    // It never owned the lock, so it must not delete the other instance's lock.
    expect(await redis.get('stuck:lock')).toBe('dead-instance');
  });

  it('degrades to the fill when Redis is down', async () => {
    redis.failWith = new Error('ECONNREFUSED');
    const fill = vi.fn().mockResolvedValue(42);

    await expect(getOrFill({ cache: 'down', key: 'k', ttlSeconds: 30, fill })).resolves.toBe(42);
    expect(fill).toHaveBeenCalledTimes(1);
  });

  it('uses a custom store when one is provided', async () => {
    const store = vi.fn().mockResolvedValue(undefined);

    await getOrFill({ cache: 's', key: 'k', ttlSeconds: 30, fill: async () => ({ a: 1 }), store });

    expect(store).toHaveBeenCalledWith(JSON.stringify({ a: 1 }));
    expect(await redis.get('k')).toBeNull();
  });
});
