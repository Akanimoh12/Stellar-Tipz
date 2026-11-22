/**
 * Live Postgres tests for the analytics queries (issue #1265). Skipped unless
 * TEST_DATABASE_URL is set — see common/testing/liveServices.ts.
 *
 * 1. Equivalence: the SQL aggregation returns exactly what the previous
 *    in-memory implementation computed (re-implemented below as an oracle,
 *    using UTC dates as production servers do).
 * 2. Regression bounds: on 200k tips every analytics query runs a fixed number
 *    of queries and finishes within a generous time budget.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TEST_DATABASE_URL, pushSchema, useLiveServices } from '../../common/testing/liveServices.js';

useLiveServices();
// Measure the queries themselves, not the cache.
vi.mock('./analytics.cache.js', () => ({
  cachedAnalytics: (_scope: unknown, _query: string, _params: unknown, run: () => Promise<unknown>) => run(),
  invalidateRollupAnalytics: async () => undefined,
  invalidateCreatorAnalytics: async () => undefined,
}));

const { prisma } = await import('../../db/prisma.js');
const analytics = await import('./analytics.service.js');
const { countQueries, queryCounterMiddleware } = await import('../../common/testing/queryCounter.js');

type Tip = { from: string; to: string; amount: bigint; createdAt: Date; status: 'CONFIRMED' | 'PENDING' | 'REFUNDED' };

/** The pre-#1265 bucketing, in UTC. */
function oracleBucket(date: Date, granularity: string): string {
  if (granularity === 'week') {
    const start = new Date(date);
    start.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return start.toISOString().slice(0, 10);
  }
  if (granularity === 'month') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return date.toISOString().slice(0, 10);
}

function oracleVolume(tips: Tip[], granularity: string, start: Date, end: Date) {
  const buckets = new Map<string, { total: bigint; count: number }>();
  const inRange = tips
    .filter((t) => t.status === 'CONFIRMED' && t.createdAt >= start && t.createdAt <= end)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const tip of inRange) {
    const key = oracleBucket(tip.createdAt, granularity);
    const bucket = buckets.get(key) ?? { total: 0n, count: 0 };
    bucket.total += tip.amount;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets].map(([date, b]) => ({ date, totalTips: b.total.toString(), count: b.count }));
}

let rng = 20260926;
const random = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];

describe.skipIf(!TEST_DATABASE_URL)('analytics SQL on Postgres (live)', () => {
  const tippers = Array.from({ length: 25 }, (_, i) => `GTIPPER${String(i).padStart(3, '0')}`);
  const creators = ['GCREATORA', 'GCREATORB', 'GCREATORC'];
  const end = new Date('2026-06-30T23:59:59.999Z');
  const start = new Date('2026-03-01T00:00:00.000Z');
  const tips: Tip[] = [];

  beforeAll(async () => {
    pushSchema();
    await prisma.$executeRawUnsafe('TRUNCATE "Tip", "AnalyticsDaily", "TipperRollup", "User" CASCADE');
    for (let i = 0; i < 1500; i++) {
      tips.push({
        from: pick(tippers),
        to: pick(creators),
        amount: BigInt(1 + Math.floor(random() * 5) * 1_000_000),
        createdAt: new Date(start.getTime() - 5 * 86_400_000 + random() * 130 * 86_400_000),
        status: random() < 0.85 ? 'CONFIRMED' : random() < 0.5 ? 'PENDING' : 'REFUNDED',
      });
    }
    await prisma.tip.createMany({
      data: tips.map((t, i) => ({
        txHash: `tx-${i}`,
        ledger: i,
        fromAddress: t.from,
        toAddress: t.to,
        amountStroops: t.amount,
        status: t.status,
        createdAt: t.createdAt,
      })),
    });
    await prisma.user.createMany({
      data: [
        { stellarAddress: 'GCREATORA', username: 'creator_a' },
        ...tippers.slice(0, 5).map((address, i) => ({ stellarAddress: address, username: `tipper_${i}` })),
      ],
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(['day', 'week', 'month'])('tip volume by %s matches the previous implementation', async (granularity) => {
    const result = await analytics.getTipVolume(granularity, start.toISOString(), end.toISOString());
    expect(result.entries).toEqual(oracleVolume(tips, granularity, start, end));
  });

  it('creator analytics matches the previous implementation', async () => {
    const result = await analytics.getCreatorAnalytics('creator_a', '2026-03-01', '2026-06-30', 'week');
    const received = tips
      .filter((t) => t.to === 'GCREATORA' && t.status === 'CONFIRMED' && t.createdAt >= start && t.createdAt <= new Date('2026-06-30'))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const volume = received.reduce((sum, t) => sum + t.amount, 0n);

    expect(result.summary).toEqual({
      totalTipsReceived: received.length,
      totalVolumeReceived: volume.toString(),
      uniqueTippers: new Set(received.map((t) => t.from)).size,
      averageTipSize: (volume / BigInt(received.length)).toString(),
      firstTipDate: received[0].createdAt.toISOString().slice(0, 10),
      lastTipDate: received[received.length - 1].createdAt.toISOString().slice(0, 10),
    });

    const series = new Map<string, { count: number; volume: bigint; tippers: Set<string> }>();
    for (const tip of received) {
      const key = oracleBucket(tip.createdAt, 'week');
      const bucket = series.get(key) ?? { count: 0, volume: 0n, tippers: new Set<string>() };
      bucket.count += 1;
      bucket.volume += tip.amount;
      bucket.tippers.add(tip.from);
      series.set(key, bucket);
    }
    expect(result.timeSeries).toEqual(
      [...series].map(([date, b]) => ({ date, totalTips: b.count, totalVolume: b.volume.toString(), uniqueTippers: b.tippers.size })),
    );

    const perTipper = new Map<string, { total: bigint; count: number }>();
    for (const tip of received) {
      const entry = perTipper.get(tip.from) ?? { total: 0n, count: 0 };
      entry.total += tip.amount;
      entry.count += 1;
      perTipper.set(tip.from, entry);
    }
    const expectedTop = [...perTipper]
      .sort((a, b) => (a[1].total === b[1].total ? (a[0] < b[0] ? -1 : 1) : a[1].total > b[1].total ? -1 : 1))
      .slice(0, 10)
      .map(([address, e]) => ({ stellarAddress: address, totalTipsStroops: e.total.toString(), tipCount: e.count }));
    expect(result.topTippers.map(({ stellarAddress, totalTipsStroops, tipCount }) => ({ stellarAddress, totalTipsStroops, tipCount }))).toEqual(expectedTop);
    expect(result.topTippers.find((t) => t.stellarAddress === 'GTIPPER000')?.username ?? 'tipper_0').toBe('tipper_0');
  });

  it('top tippers counts every tipper and pages deterministically', async () => {
    const all = new Map<string, bigint>();
    for (const tip of tips) all.set(tip.from, (all.get(tip.from) ?? 0n) + tip.amount);

    const pages = [await analytics.getTopTippers(1, 10), await analytics.getTopTippers(2, 10), await analytics.getTopTippers(3, 10)];
    const listed = pages.flatMap((page) => page.entries.map((e) => e.stellarAddress));

    expect(pages[0].total).toBe(all.size);
    expect(listed).toHaveLength(all.size);
    expect(new Set(listed).size).toBe(all.size);
  });

  it('the top-tippers rollup reproduces the live ranking exactly', async () => {
    const live = [await analytics.getTopTippers(1, 10), await analytics.getTopTippers(2, 10), await analytics.getTopTippers(3, 10)];

    await expect(analytics.refreshTipperRollup()).resolves.toBe(tippers.length);
    const rolled = [await analytics.getTopTippers(1, 10), await analytics.getTopTippers(2, 10), await analytics.getTopTippers(3, 10)];

    expect(rolled).toEqual(live);
    await prisma.$executeRawUnsafe('TRUNCATE "TipperRollup"');
  });

  it.each(['day', 'week', 'month'])(
    'tip volume by %s is unchanged when finished rollup days are served from AnalyticsDaily',
    async (granularity) => {
      // The rollup job has processed every closed day in March and April.
      for (let day = new Date('2026-03-01T00:00:00Z'); day < new Date('2026-05-01T00:00:00Z'); day = new Date(day.getTime() + 86_400_000)) {
        await analytics.computeDailyAnalytics(day.toISOString().slice(0, 10));
      }
      const rangeStart = new Date('2026-02-27T13:30:00Z'); // partial edge day
      const rangeEnd = new Date('2026-05-03T08:00:00Z');

      const result = await analytics.getTipVolume(granularity, rangeStart.toISOString(), rangeEnd.toISOString());

      expect(result.entries).toEqual(oracleVolume(tips, granularity, rangeStart, rangeEnd));
      await prisma.$executeRawUnsafe('TRUNCATE "AnalyticsDaily"');
    },
    60_000,
  );

  it('the daily rollup job matches the raw rows for that day', async () => {
    const day = '2026-04-15';
    const from = new Date(`${day}T00:00:00.000Z`);
    const to = new Date(`${day}T23:59:59.999Z`);
    const confirmed = tips.filter((t) => t.status === 'CONFIRMED' && t.createdAt >= from && t.createdAt <= to);

    const row = await analytics.computeDailyAnalytics(day);

    expect(row).toMatchObject({
      date: day,
      totalTips: confirmed.length,
      totalVolume: confirmed.reduce((sum, t) => sum + t.amount, 0n).toString(),
      activeUsers: new Set(confirmed.flatMap((t) => [t.from, t.to])).size,
    });
    await expect(analytics.getAnalyticsSummary(day, day)).resolves.toMatchObject({ totalTips: confirmed.length });
  });
});

describe.skipIf(!TEST_DATABASE_URL)('analytics regression bounds on 200k tips (live)', () => {
  // Generous budgets: these guard against an O(rows) regression (which costs
  // seconds at this volume), not against normal machine-to-machine variance.
  const BUDGET_MS = 1_500;

  beforeAll(async () => {
    pushSchema();
    prisma.$use(queryCounterMiddleware);
    await prisma.$executeRawUnsafe('TRUNCATE "Tip", "AnalyticsDaily", "TipperRollup", "User" CASCADE');
    await prisma.$executeRawUnsafe(`
      INSERT INTO "User" ("id", "stellarAddress", "username", "createdAt", "updatedAt")
      SELECT 'u' || n, 'G' || lpad(n::text, 55, '0'), 'user_' || n, now(), now() FROM generate_series(1, 5000) AS n`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Tip" ("id", "txHash", "ledger", "fromAddress", "toAddress", "amountStroops", "status", "createdAt")
      SELECT 't' || n, md5('t' || n), n,
             'G' || lpad((1 + (n * 7919) % 5000)::text, 55, '0'),
             'G' || lpad((1 + floor(pow((n % 1000) / 1000.0, 3) * 500))::int::text, 55, '0'),
             1000000, 'CONFIRMED', now() - (n % 365 || ' days')::interval
      FROM generate_series(1, 200000) AS n`);
    await prisma.$executeRawUnsafe('ANALYZE "Tip"');
    await analytics.refreshTipperRollup(); // as the scheduled rollup job would
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const yearAgo = () => new Date(Date.now() - 365 * 86_400_000).toISOString();

  it.each([
    ['volume by week over a year', () => analytics.getTipVolume('week', yearAgo()), 2],
    ['top tippers', () => analytics.getTopTippers(5, 20), 3],
    ['creator analytics for the busiest creator', () => analytics.getCreatorAnalytics('user_1', undefined, undefined, 'day'), 5],
    ['daily rollup job', () => analytics.computeDailyAnalytics(new Date().toISOString().slice(0, 10)), 4],
  ])('%s stays within budget and a fixed query count', async (_name, run, expectedQueries) => {
    await run(); // warm-up
    const started = performance.now();
    const { count } = await countQueries(run as () => Promise<unknown>);
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
    expect(count).toBe(expectedQueries);
  }, 30_000);
});
