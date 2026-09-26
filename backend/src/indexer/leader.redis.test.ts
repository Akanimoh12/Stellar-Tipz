/**
 * Live Redis tests for indexer leader election (issue #1263): the real Lua
 * scripts and real key expiry. Skipped unless TEST_REDIS_URL is set — see
 * common/testing/liveServices.ts.
 */
import Redis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_REDIS_URL } from '../common/testing/liveServices.js';

vi.mock('../db/redis.js', () => ({ redis: { on: vi.fn() } }));

const { LeaderElector, LeadershipLostError } = await import('./leader.js');
type LeaseClient = import('./leader.js').LeaseClient;

const KEY = `test:indexer:leader:${process.pid}`;
const LEASE_MS = 400;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!TEST_REDIS_URL)('leader election on Redis (live)', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(TEST_REDIS_URL!);
  });
  beforeEach(async () => {
    await redis.del(KEY, `${KEY}:epoch`);
  });
  afterAll(async () => {
    await redis.del(KEY, `${KEY}:epoch`);
    await redis.quit();
  });

  const elector = (id: string) =>
    new LeaderElector({ redis: redis as unknown as LeaseClient, key: KEY, leaseMs: LEASE_MS, renewIntervalMs: 100, instanceId: id });

  it('elects one leader, renews it past its lease, and releases it on stop', async () => {
    const a = elector('a');
    const b = elector('b');
    await a.tick();
    await b.tick();
    expect([a.isLeader(), b.isLeader()]).toEqual([true, false]);

    for (let i = 0; i < 6; i++) {
      await sleep(100);
      await a.tick(); // real PEXPIRE through the renew script
      await b.tick();
    }
    expect(a.isLeader()).toBe(true);
    expect(await redis.pttl(KEY)).toBeGreaterThan(LEASE_MS / 2);

    await a.stop();
    expect(await redis.get(KEY)).toBeNull();
    await b.tick();
    expect(b.isLeader()).toBe(true);
    expect(b.currentEpoch).toBe(2);
    await b.stop();
  });

  it('fails over when the leader stops renewing, and the old leader cannot commit', async () => {
    const a = elector('a');
    const b = elector('b');
    await a.tick();

    await sleep(LEASE_MS + 50); // a is frozen; its key expires in Redis
    await b.tick();
    expect(b.isLeader()).toBe(true);

    await expect(a.assertLeadership()).rejects.toBeInstanceOf(LeadershipLostError);
    expect(await redis.get(KEY)).toBe('b'); // the renew script never touched b's lease
    await b.stop();
  });

  it('only the owner can release or renew the lease', async () => {
    const a = elector('a');
    await a.tick();
    await redis.set(KEY, 'intruder', 'PX', 5_000); // someone else now holds it

    await expect(a.assertLeadership()).rejects.toBeInstanceOf(LeadershipLostError);
    await a.stop();
    expect(await redis.get(KEY)).toBe('intruder');
  });
});
