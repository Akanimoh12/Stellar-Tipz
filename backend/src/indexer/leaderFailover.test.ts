/**
 * Failover and split-brain tests for multi-instance indexing (issue #1263).
 *
 * Runs the real poll loop, leader elector and fenced cursor writes against an
 * in-memory chain, an in-memory IndexerCursor table and a fake Redis, and
 * checks that failover never skips or double-applies a ledger and that a
 * deposed leader can never commit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRedis } from '../common/testing/fakeRedis.js';
import type { DecodedEvent } from './sorobanClient.js';

const { chain, cursorTable, projected, hooks } = vi.hoisted(() => ({
  chain: { head: 0, events: [] as DecodedEvent[] },
  cursorTable: new Map<string, { lastLedger: number; leaderEpoch: number }>(),
  projected: new Map<string, number>(),
  hooks: {
    onProject: undefined as undefined | ((event: DecodedEvent) => Promise<void>),
    beforeCursorTx: undefined as undefined | (() => Promise<void>),
  },
}));

vi.mock('../db/redis.js', () => ({ redis: { on: vi.fn() } }));

vi.mock('../db/prisma.js', () => {
  const client = {
    indexerCursor: {
      findUnique: async ({ where }: { where: { topic: string } }) => {
        const row = cursorTable.get(where.topic);
        return row ? { topic: where.topic, ...row } : null;
      },
      upsert: async (args: {
        where: { topic: string };
        create: { lastLedger: number; leaderEpoch?: number };
        update: { lastLedger: number; leaderEpoch?: number };
      }) => {
        const row = cursorTable.get(args.where.topic);
        const next = row ? { ...row, ...args.update } : { leaderEpoch: 0, ...args.create };
        cursorTable.set(args.where.topic, { lastLedger: next.lastLedger, leaderEpoch: next.leaderEpoch ?? 0 });
      },
      aggregate: async () => ({
        _max: { leaderEpoch: Math.max(0, ...[...cursorTable.values()].map((row) => row.leaderEpoch)) },
      }),
    },
    // Only query issued: `SELECT "leaderEpoch" ... WHERE "topic" = $1 FOR UPDATE`.
    $queryRaw: async (_sql: TemplateStringsArray, topic: string) => {
      const row = cursorTable.get(topic);
      return row ? [{ leaderEpoch: row.leaderEpoch }] : [];
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const hook = hooks.beforeCursorTx;
      hooks.beforeCursorTx = undefined;
      if (hook) await hook();
      return fn(client);
    },
  };
  return { prisma: client };
});

vi.mock('./sorobanClient.js', () => ({
  getLatestLedger: async () => chain.head,
  getLedgerHash: async () => null,
  getEventsFrom: async (startLedger: number, pagingToken?: string) => ({
    events: pagingToken ? [] : chain.events.filter((event) => event.ledger >= startLedger),
    latestLedger: chain.head,
  }),
}));

vi.mock('./projections.js', () => ({
  projectEvent: async (event: DecodedEvent) => {
    await hooks.onProject?.(event);
    // Projections are idempotent (keyed by txHash), so count distinct effects.
    projected.set(event.txHash, (projected.get(event.txHash) ?? 0) + 1);
  },
}));
vi.mock('./reorg.js', () => ({ checkAndHandleReorg: async () => false }));
vi.mock('./ledger-checkpoint.store.js', () => ({ recordCheckpoint: vi.fn() }));

const { pollOnce } = await import('./poller.js');
const { LeaderElector, LeadershipLostError, RENEW_LEASE_SCRIPT } = await import('./leader.js');
const { CursorFencedError, getMaxLeaderEpoch } = await import('./cursor.js');
const { RELEASE_LOCK_SCRIPT } = await import('../common/utils/cache.js');

const TOPIC = 'tip_events';
const LEASE_MS = 10_000;
const FINALITY = 10; // default INDEXER_FINALITY_DEPTH

let now: number;
let redis: FakeRedis;

function instance(id: string) {
  return new LeaderElector({
    redis,
    key: 'test:indexer:leader',
    leaseMs: LEASE_MS,
    renewIntervalMs: 3_000,
    instanceId: id,
    epochFloor: getMaxLeaderEpoch,
    clock: { monotonic: () => now, wall: () => now },
  });
}

function ledgersProjected(): number[] {
  return [...projected.keys()].map((txHash) => Number(txHash.slice(3))).sort((a, b) => a - b);
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

beforeEach(() => {
  now = 5_000_000;
  redis = new FakeRedis();
  redis.now = () => now;
  redis.defineScript(RENEW_LEASE_SCRIPT, ([key], [token, ttl], r) =>
    r.peek(key) === token ? r.setTtl(key, Number(ttl)) : 0,
  );
  redis.defineScript(RELEASE_LOCK_SCRIPT, ([key], [token], r) => (r.peek(key) === token ? r.remove(key) : 0));

  chain.events = range(101, 200).map((ledger) => ({
    topic: 'tip_sent',
    ledger,
    txHash: `tx-${ledger}`,
    pagingToken: `${ledger}-1`,
    value: {},
  }));
  cursorTable.clear();
  cursorTable.set(TOPIC, { lastLedger: 100, leaderEpoch: 0 });
  projected.clear();
  hooks.onProject = undefined;
  hooks.beforeCursorTx = undefined;
});

describe('indexer failover (issue #1263)', () => {
  it('a standby resumes after a crashed leader without skipping or repeating ledgers', async () => {
    const a = instance('a');
    const b = instance('b');
    await a.tick();
    await b.tick();

    chain.head = 130;
    await pollOnce(a);
    expect(cursorTable.get(TOPIC)).toEqual({ lastLedger: 130 - FINALITY, leaderEpoch: 1 });

    // a crashes; once its lease expires b takes over.
    now += LEASE_MS + 1;
    await b.tick();
    expect(b.isLeader()).toBe(true);

    chain.head = 150;
    await pollOnce(b);

    expect(cursorTable.get(TOPIC)).toEqual({ lastLedger: 150 - FINALITY, leaderEpoch: 2 });
    expect(ledgersProjected()).toEqual(range(101, 140)); // no gap
    expect([...projected.values()].every((count) => count === 1)).toBe(true); // no repeat
  });

  it('a standby never indexes while the leader is healthy', async () => {
    const a = instance('a');
    const b = instance('b');
    await a.tick();
    await b.tick();

    chain.head = 130;
    await expect(pollOnce(b)).rejects.toBeInstanceOf(LeadershipLostError);

    expect(projected.size).toBe(0);
    expect(cursorTable.get(TOPIC)?.lastLedger).toBe(100);
  });
});

describe('split-brain prevention (issue #1263)', () => {
  it('a leader paused mid-tick stops at the next lease check and never commits', async () => {
    const a = instance('a');
    const b = instance('b');
    await a.tick();
    chain.head = 130;

    hooks.onProject = async (event) => {
      if (event.ledger !== 105) return;
      hooks.onProject = undefined;
      // a freezes here past its lease; b takes over and completes a full tick.
      now += LEASE_MS + 1;
      await b.tick();
      await pollOnce(b);
    };

    await expect(pollOnce(a)).rejects.toBeInstanceOf(LeadershipLostError);

    expect(cursorTable.get(TOPIC)).toEqual({ lastLedger: 120, leaderEpoch: 2 });
    // Every finalized ledger was applied; a's partial work only replayed idempotently.
    expect(ledgersProjected()).toEqual(range(101, 120));
    expect(projected.get('tx-106')).toBe(1); // a stopped right after its pause
  });

  it('the database fence rejects a leader paused between its lease check and its commit', async () => {
    const a = instance('a');
    const b = instance('b');
    await a.tick();
    chain.head = 130;

    hooks.beforeCursorTx = async () => {
      // a passed its final lease check, then froze before committing; b took over
      // and advanced the cursor further in the meantime.
      now += LEASE_MS + 1;
      await b.tick();
      chain.head = 140;
      await pollOnce(b);
    };

    await expect(pollOnce(a)).rejects.toBeInstanceOf(CursorFencedError);

    // b's progress stands; a's stale write (cursor 120 at epoch 1) was rejected.
    expect(cursorTable.get(TOPIC)).toEqual({ lastLedger: 130, leaderEpoch: 2 });
    expect(ledgersProjected()).toEqual(range(101, 130));
  });

  it('a recovered stale leader rejoins as a standby', async () => {
    const a = instance('a');
    const b = instance('b');
    await a.tick();
    now += LEASE_MS + 1;
    await b.tick();

    await a.tick(); // a notices it lost the lease
    expect(a.isLeader()).toBe(false);
    expect(b.isLeader()).toBe(true);

    now += LEASE_MS + 1; // b now crashes too
    await a.tick();
    expect(a.isLeader()).toBe(true);
    expect(a.currentEpoch).toBe(3);
  });
});
