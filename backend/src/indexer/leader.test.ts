import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRedis } from '../common/testing/fakeRedis.js';
import { registry } from '../common/observability/prometheus.js';

vi.mock('../db/redis.js', () => ({ redis: { on: vi.fn() } }));

const { LeaderElector, LeadershipLostError, RENEW_LEASE_SCRIPT } = await import('./leader.js');
const { RELEASE_LOCK_SCRIPT } = await import('../common/utils/cache.js');

const LEASE_MS = 10_000;
const RENEW_MS = 3_000;
const KEY = 'test:indexer:leader';

/** Shared "real" time, plus per-instance clocks that can be frozen to model a paused VM. */
let now: number;
let redis: FakeRedis;

function freshRedis(): FakeRedis {
  const fake = new FakeRedis();
  fake.now = () => now;
  fake.defineScript(RENEW_LEASE_SCRIPT, ([key], [token, ttl], r) =>
    r.peek(key) === token ? r.setTtl(key, Number(ttl)) : 0,
  );
  fake.defineScript(RELEASE_LOCK_SCRIPT, ([key], [token], r) => (r.peek(key) === token ? r.remove(key) : 0));
  return fake;
}

function elector(
  id: string,
  options: { clock?: { monotonic: () => number; wall: () => number }; epochFloor?: () => Promise<number> } = {},
) {
  return new LeaderElector({
    redis,
    key: KEY,
    leaseMs: LEASE_MS,
    renewIntervalMs: RENEW_MS,
    instanceId: id,
    clock: options.clock ?? { monotonic: () => now, wall: () => now },
    epochFloor: options.epochFloor,
  });
}

async function metric(name: string): Promise<Array<{ labels: Record<string, string>; value: number }>> {
  const found = (await registry.getMetricsAsJSON()).find((m) => m.name === name);
  return (found?.values ?? []) as Array<{ labels: Record<string, string>; value: number }>;
}

beforeEach(() => {
  now = 1_000_000;
  redis = freshRedis();
  registry.resetMetrics();
});

describe('LeaderElector — election', () => {
  it('elects exactly one leader among competing instances', async () => {
    const instances = ['a', 'b', 'c'].map((id) => elector(id));
    for (const instance of instances) await instance.tick();

    expect(instances.map((i) => i.isLeader())).toEqual([true, false, false]);
    expect(instances[0].currentEpoch).toBe(1);
    expect(await redis.get(KEY)).toBe('a');
  });

  it('keeps leadership across many lease periods while renewing', async () => {
    const a = elector('a');
    const b = elector('b');
    await a.tick();

    for (let i = 0; i < 10; i++) {
      now += RENEW_MS;
      await a.tick();
      await b.tick();
    }

    expect(a.isLeader()).toBe(true);
    expect(b.isLeader()).toBe(false);
    expect(a.currentEpoch).toBe(1);
  });

  it('does not wait on Redis while the client is reconnecting', async () => {
    Object.assign(redis, { status: 'reconnecting' });
    redis.set = () => new Promise(() => undefined); // a queued command never settles

    const a = elector('a');
    await a.tick();
    expect(a.isLeader()).toBe(false);
  });
});

describe('LeaderElector — failover', () => {
  it('replaces a crashed leader once its lease expires, with a higher epoch', async () => {
    const a = elector('a');
    const b = elector('b');
    await a.tick();

    // a crashes: no more renewals. Before expiry, b still cannot take over.
    now += LEASE_MS - 1;
    await b.tick();
    expect(b.isLeader()).toBe(false);

    now += 2;
    await b.tick();
    expect(b.isLeader()).toBe(true);
    expect(b.currentEpoch).toBe(2);
    expect(a.isLeader()).toBe(false);
  });

  it('hands over immediately on graceful shutdown', async () => {
    const a = elector('a');
    const b = elector('b');
    await a.tick();

    await a.stop();
    await b.tick();

    expect(b.isLeader()).toBe(true);
    expect(await redis.get(KEY)).toBe('b');
  });

  it('keeps epochs above the persisted floor even if Redis lost the counter', async () => {
    const a = elector('a', { epochFloor: async () => 41 });
    await a.tick();

    expect(a.currentEpoch).toBe(42);
    expect(await redis.get(`${KEY}:epoch`)).toBe('42');
  });

  it('releases the lease if it cannot establish an epoch', async () => {
    const a = elector('a', {
      epochFloor: async () => {
        throw new Error('database unavailable');
      },
    });
    await a.tick();

    expect(a.isLeader()).toBe(false);
    expect(await redis.get(KEY)).toBeNull();
  });
});

describe('LeaderElector — split-brain prevention', () => {
  it('stops a leader that was paused past its lease before it can commit', async () => {
    const a = elector('a');
    const b = elector('b');
    await a.tick();
    await expect(a.assertLeadership()).resolves.toBe(1);

    // a is paused (GC / VM freeze) past its lease; b takes over meanwhile.
    now += LEASE_MS + 1;
    await b.tick();
    expect(b.isLeader()).toBe(true);

    // a resumes still "believing" it leads; the check before its next commit fails.
    expect(() => a.assertLocalLease()).toThrow(LeadershipLostError);
    await expect(a.assertLeadership()).rejects.toThrow(LeadershipLostError);
    expect(a.isLeader()).toBe(false);
  });

  it('detects a VM freeze even if the monotonic clock did not advance', async () => {
    const frozenMonotonic = now;
    const a = elector('a', { clock: { monotonic: () => frozenMonotonic, wall: () => now } });
    await a.tick();

    now += LEASE_MS + 1; // wall time moved on, the paused monotonic clock did not

    expect(a.isLeader()).toBe(false);
    expect(() => a.assertLocalLease()).toThrow(LeadershipLostError);
  });

  it('refuses to commit when Redis shows another owner, even if the local deadline has not passed', async () => {
    const slowClock = { monotonic: () => 0, wall: () => 0 }; // a's clocks lag far behind
    const a = elector('a', { clock: slowClock });
    await a.tick();

    // The lease expired in Redis (real time) and b acquired it.
    now += LEASE_MS + 1;
    const b = elector('b');
    await b.tick();

    expect(a.isLeader()).toBe(true); // a's own clocks cannot tell
    await expect(a.assertLeadership()).rejects.toThrow(LeadershipLostError);
    expect(a.isLeader()).toBe(false);
    expect(await redis.get(KEY)).toBe('b'); // a never touched b's lease
  });

  it('refuses to commit when the lease cannot be confirmed, without giving it up early', async () => {
    const a = elector('a');
    await a.tick();

    redis.failWith = new Error('ECONNRESET');
    await expect(a.assertLeadership()).rejects.toThrow(LeadershipLostError);
    expect(a.isLeader()).toBe(true); // still within its lease; the next renewal may succeed

    redis.failWith = null;
    await expect(a.assertLeadership()).resolves.toBe(1);
  });

  it('never lets two instances hold the lease at the same time', async () => {
    const instances = ['a', 'b', 'c'].map((id) => elector(id));
    // Random interleaving of ticks, crashes (skipped ticks) and time passing.
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let step = 0; step < 500; step++) {
      now += Math.floor(random() * 4_000);
      for (const instance of instances) {
        if (random() < 0.6) await instance.tick();
      }
      expect(instances.filter((i) => i.isLeader()).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('LeaderElector — observability', () => {
  it('meters acquisitions, losses and releases, and tracks the leader gauge', async () => {
    const a = elector('a');
    const b = elector('b');
    await a.tick();
    expect(await metric('tipz_indexer_is_leader')).toEqual([expect.objectContaining({ value: 1 })]);

    now += LEASE_MS + 1;
    await b.tick(); // b acquires
    await a.tick(); // a notices its lease expired
    await b.stop(); // b releases

    const transitions = Object.fromEntries(
      (await metric('tipz_indexer_leadership_transitions_total')).map((v) => [v.labels.transition, v.value]),
    );
    expect(transitions).toEqual({ acquired: 2, lost: 1, released: 1 });
    expect(await metric('tipz_indexer_is_leader')).toEqual([expect.objectContaining({ value: 0 })]);
  });

  it('runs its renew loop until stopped', async () => {
    const a = new LeaderElector({ redis, key: KEY, leaseMs: 1_000, renewIntervalMs: 20, instanceId: 'a' });
    redis.now = () => Date.now();

    a.start();
    await vi.waitFor(() => expect(a.isLeader()).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 1_200)); // longer than one lease
    expect(a.isLeader()).toBe(true); // kept alive by renewals

    await a.stop();
    expect(a.isLeader()).toBe(false);
    expect(await redis.get(KEY)).toBeNull();
  });
});
