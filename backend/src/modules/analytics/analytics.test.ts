import request from 'supertest';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import {
  computeDailyAnalytics,
  getActiveUsers,
  getAnalyticsSummary,
  getCreatorAnalytics,
  getDailyAnalytics,
  getTipVolume,
  getTopTippers,
  refreshTipperRollup,
} from './analytics.service.js';
import { assertConstantQueryCount, countQueries, queryCounterMiddleware } from '../../common/testing/queryCounter.js';

const db = vi.hoisted(() => ({
  analyticsDaily: { findMany: vi.fn(), count: vi.fn(), upsert: vi.fn(), aggregate: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
}));
const { mockInvalidateRollup } = vi.hoisted(() => ({ mockInvalidateRollup: vi.fn() }));

vi.mock('../../db/prisma.js', () => ({ prisma: { ...db, $disconnect: vi.fn() } }));

// Service tests exercise the queries; caching is covered in analytics.cache.test.ts.
vi.mock('./analytics.cache.js', () => ({
  cachedAnalytics: (_scope: unknown, _query: string, _params: unknown, run: () => Promise<unknown>) => run(),
  invalidateRollupAnalytics: mockInvalidateRollup,
  invalidateCreatorAnalytics: vi.fn(),
}));

/** Rebuilds the Prisma.Sql of a `$queryRaw` tagged-template call. */
function sqlOf(call: unknown[]): Prisma.Sql {
  return Prisma.sql(call[0] as TemplateStringsArray, ...(call.slice(1) as Prisma.Sql[]));
}

function rawCalls(): Prisma.Sql[] {
  return db.$queryRaw.mock.calls.map(sqlOf);
}

/** Routes every mocked Prisma call through the real query-counting middleware. */
function countEveryQuery(): void {
  const wrap = (model: string, action: string, fn: ReturnType<typeof vi.fn>) => {
    const impl = fn.getMockImplementation() ?? (async () => undefined);
    fn.mockImplementation((...args: unknown[]) =>
      queryCounterMiddleware(
        { model: model as Prisma.ModelName, action: action as Prisma.PrismaAction, args: {}, dataPath: [], runInTransaction: false },
        async () => impl(...args),
      ),
    );
  };
  for (const [model, delegate] of Object.entries({ AnalyticsDaily: db.analyticsDaily, User: db.user })) {
    for (const [action, fn] of Object.entries(delegate)) wrap(model, action, fn);
  }
  wrap('Tip', 'queryRaw', db.$queryRaw);
}

function resetMocks() {
  vi.clearAllMocks();
  db.analyticsDaily.findMany.mockResolvedValue([]);
  db.analyticsDaily.count.mockResolvedValue(0);
  db.analyticsDaily.aggregate.mockResolvedValue({ _sum: {} });
  db.analyticsDaily.upsert.mockRejectedValue(new Error('unexpected call'));
  db.user.findUnique.mockResolvedValue(null);
  db.user.findMany.mockResolvedValue([]);
  db.user.count.mockResolvedValue(0);
  db.$queryRaw.mockResolvedValue([]);
}

beforeEach(resetMocks);

describe('GET /api/v1/analytics/daily', () => {
  it('returns 200 with empty data by default', async () => {
    const res = await request(createApp()).get('/api/v1/analytics/daily');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ limit: 30, offset: 0, total: 0, hasMore: false });
  });

  it('returns daily analytics entries', async () => {
    db.analyticsDaily.findMany.mockResolvedValue([
      { date: new Date('2026-07-24'), totalTips: 5, totalVolume: BigInt(100000000), newUsers: 2, activeUsers: 4 },
    ]);
    db.analyticsDaily.count.mockResolvedValue(1);

    const res = await request(createApp()).get('/api/v1/analytics/daily');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { date: '2026-07-24', totalTips: 5, totalVolume: '100000000', newUsers: 2, activeUsers: 4 },
    ]);
  });

  it('passes date range filters to prisma', async () => {
    await request(createApp()).get('/api/v1/analytics/daily?startDate=2026-07-01&endDate=2026-07-31');

    expect(db.analyticsDaily.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { date: { gte: new Date('2026-07-01'), lte: new Date('2026-07-31') } },
      }),
    );
  });

  it('returns 400 for invalid date format', async () => {
    const res = await request(createApp()).get('/api/v1/analytics/daily?startDate=07-01-2026');
    expect(res.status).toBe(400);
  });

  it('returns 400 for limit exceeding max', async () => {
    const res = await request(createApp()).get('/api/v1/analytics/daily?limit=1000');
    expect(res.status).toBe(400);
  });

  it('reports hasMore when additional pages exist', async () => {
    db.analyticsDaily.findMany.mockResolvedValue([
      { date: new Date(), totalTips: 1, totalVolume: BigInt(0), newUsers: 1, activeUsers: 1 },
    ]);
    db.analyticsDaily.count.mockResolvedValue(10);

    const result = await getDailyAnalytics(undefined, undefined, 5, 0);

    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.total).toBe(10);
  });
});

describe('GET /api/v1/analytics/summary', () => {
  it('sums the rollup in the database with a single aggregate', async () => {
    db.analyticsDaily.aggregate.mockResolvedValue({
      _sum: { totalTips: 25, totalVolume: BigInt(500000000), newUsers: 5, activeUsers: 20 },
    });

    const res = await request(createApp()).get('/api/v1/analytics/summary');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalTips: 25,
      totalVolume: '500000000',
      totalNewUsers: 5,
      totalActiveUsers: 20,
      period: { start: null, end: null },
    });
    expect(db.analyticsDaily.findMany).not.toHaveBeenCalled();
  });

  it('passes the date range and handles an empty range', async () => {
    await expect(getAnalyticsSummary('2026-07-01', '2026-07-31')).resolves.toMatchObject({
      totalTips: 0,
      totalVolume: '0',
      period: { start: '2026-07-01', end: '2026-07-31' },
    });
    expect(db.analyticsDaily.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { date: { gte: new Date('2026-07-01'), lte: new Date('2026-07-31') } } }),
    );
  });
});

describe('GET /api/v1/analytics/volume', () => {
  /** Serves the AnalyticsDaily rollup query and the raw Tip query separately. */
  function serveVolume(rollup: unknown[], raw: unknown[]): void {
    db.$queryRaw.mockImplementation(async (...call: unknown[]) =>
      sqlOf(call).sql.includes('"AnalyticsDaily"') ? rollup : raw,
    );
  }

  it('merges finished rollup days with raw buckets, in bucket order', async () => {
    serveVolume(
      [
        { day: new Date('2026-07-11T00:00:00Z'), bucket: '2026-07-11', total: 300000000n, count: 2 },
        { day: new Date('2026-07-12T00:00:00Z'), bucket: '2026-07-12', total: 50000000n, count: 1 },
      ],
      [
        { bucket: '2026-07-13', total: 7n, count: 1 },
        { bucket: '2026-07-10', total: 5n, count: 1 },
      ],
    );

    const res = await request(createApp()).get(
      '/api/v1/analytics/volume?granularity=day&startDate=2026-07-10T12:00:00Z&endDate=2026-07-13T12:00:00Z',
    );

    expect(res.status).toBe(200);
    expect(res.body.data.entries).toEqual([
      { date: '2026-07-10', totalTips: '5', count: 1 },
      { date: '2026-07-11', totalTips: '300000000', count: 2 },
      { date: '2026-07-12', totalTips: '50000000', count: 1 },
      { date: '2026-07-13', totalTips: '7', count: 1 },
    ]);
  });

  it('adds rollup and raw totals that land in the same bucket', async () => {
    serveVolume(
      [{ day: new Date('2026-07-06T00:00:00Z'), bucket: '2026-07-05', total: 10n, count: 1 }],
      [{ bucket: '2026-07-05', total: 5n, count: 2 }],
    );

    const result = await getTipVolume('week', '2026-07-05T12:00:00Z', '2026-07-07T00:00:00Z');
    expect(result.entries).toEqual([{ date: '2026-07-05', totalTips: '15', count: 3 }]);
  });

  it('reads only whole, closed days from the rollup, and only rows finished after the day ended', async () => {
    serveVolume([], []);

    await getTipVolume('day', '2026-07-10T12:00:00Z', '2026-07-13T12:00:00Z');

    const [rollup] = rawCalls();
    expect(rollup.sql).toContain('"updatedAt" >= "date" + interval \'1 day\'');
    expect(rollup.values).toEqual(['2026-07-11', '2026-07-13']); // [first whole day, end of whole days)
  });

  it('aggregates the uncovered ranges from confirmed raw tips with UTC parameters', async () => {
    serveVolume([{ day: new Date('2026-07-11T00:00:00Z'), bucket: '2026-07-11', total: 1n, count: 1 }], []);

    await getTipVolume('day', '2026-07-10T12:00:00Z', '2026-07-13T12:00:00Z');

    const [, raw] = rawCalls();
    expect(raw.sql).toContain(`"status" = 'CONFIRMED'`);
    expect(raw.sql).toMatch(/AT TIME ZONE 'UTC'/);
    // 2026-07-11 came from the rollup, so the raw query covers only the gaps around it.
    expect(raw.values).toEqual([
      new Date('2026-07-10T12:00:00Z'),
      new Date('2026-07-11T00:00:00Z'),
      new Date('2026-07-12T00:00:00Z'),
      new Date('2026-07-13T12:00:00.001Z'),
    ]);
  });

  it('skips the raw query when finished rollup days cover the whole range', async () => {
    serveVolume(
      [
        { day: new Date('2026-07-10T00:00:00Z'), bucket: '2026-07', total: 1n, count: 1 },
        { day: new Date('2026-07-11T00:00:00Z'), bucket: '2026-07', total: 2n, count: 1 },
      ],
      [],
    );

    const result = await getTipVolume('month', '2026-07-10T00:00:00Z', '2026-07-11T23:59:59.999Z');

    expect(rawCalls()).toHaveLength(1);
    expect(result.entries).toEqual([{ date: '2026-07', totalTips: '3', count: 2 }]);
  });

  it.each([
    ['day', `date_trunc('day'`, `'YYYY-MM-DD'`],
    ['week', `date_trunc('week', "createdAt" + interval '1 day') - interval '1 day'`, `'YYYY-MM-DD'`],
    ['month', `date_trunc('month'`, `'YYYY-MM'`],
  ])('buckets by %s (weeks start on Sunday, as before)', async (granularity, trunc, format) => {
    serveVolume([], []);
    await getTipVolume(granularity);
    const raw = rawCalls().find(({ sql }) => sql.includes('"Tip"'))!;
    expect(raw.sql).toContain(trunc);
    expect(raw.sql).toContain(format);
  });
});

describe('GET /api/v1/analytics/top-tippers', () => {
  it('reads one indexed page of the precomputed ranking and hydrates profiles in one query', async () => {
    db.$queryRaw.mockImplementation(async (...call: unknown[]) => {
      const { sql } = sqlOf(call);
      if (sql.includes('MAX("rank")')) return [{ ranked: 42 }];
      return [
        { fromAddress: 'GB', total: 900n, count: 3 },
        { fromAddress: 'GA', total: 900n, count: 1 },
      ];
    });
    db.user.findMany.mockResolvedValue([
      { id: 'user-a', stellarAddress: 'GA', username: 'alice', displayName: 'Alice' },
    ]);

    const result = await getTopTippers(2, 20);

    expect(result).toEqual({
      entries: [
        { userId: '', stellarAddress: 'GB', username: null, displayName: null, totalTipsStroops: '900', tipCount: 3 },
        { userId: 'user-a', stellarAddress: 'GA', username: 'alice', displayName: 'Alice', totalTipsStroops: '900', tipCount: 1 },
      ],
      total: 42,
      page: 2,
      limit: 20,
    });
    const [, page] = rawCalls();
    expect(page.sql).toContain('FROM "TipperRollup"');
    expect(page.sql).toMatch(/WHERE "rank" > \?\s+ORDER BY "rank" ASC\s+LIMIT \?/);
    expect(page.values).toEqual([20, 20]);
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('falls back to a live, deterministic aggregate until the rollup is first built', async () => {
    db.$queryRaw.mockImplementation(async (...call: unknown[]) => {
      const { sql } = sqlOf(call);
      if (sql.includes('MAX("rank")')) return [{ ranked: null }];
      if (sql.includes('AS "tippers"')) return [{ total: 7n }];
      return [{ fromAddress: 'GA', total: 5n, count: 1 }];
    });

    const result = await getTopTippers(1, 20);

    expect(result.total).toBe(7);
    const live = rawCalls().find(({ sql }) => sql.includes('LIMIT'))!;
    expect(live.sql).toMatch(/ORDER BY "total" DESC, "fromAddress" COLLATE "C" ASC/);
    expect(live.sql).toContain('FROM "Tip"');
  });

  it('refreshTipperRollup rebuilds the ranking atomically in the same order and invalidates caches', async () => {
    const executeRaw = vi.fn(async () => 3);
    const transaction = vi.fn(async (ops: Array<Promise<number>>) => Promise.all(ops));
    const { prisma } = await import('../../db/prisma.js');
    Object.assign(prisma, { $executeRaw: executeRaw, $transaction: transaction });

    await expect(refreshTipperRollup()).resolves.toBe(3);

    expect(transaction).toHaveBeenCalledOnce();
    const [memory, clear, insert] = executeRaw.mock.calls.map((call) => sqlOf(call as unknown[]).sql);
    expect(memory).toContain('SET LOCAL work_mem');
    expect(clear).toContain('DELETE FROM "TipperRollup"'); // not TRUNCATE: readers are never blocked
    expect(insert).toContain('ORDER BY "rank"');
    expect(insert).toMatch(/ROW_NUMBER\(\) OVER \(ORDER BY SUM\("amountStroops"\) DESC, "fromAddress" COLLATE "C" ASC\)/);
    expect(mockInvalidateRollup).toHaveBeenCalledOnce();
  });
});

describe('GET /api/v1/analytics/active-users', () => {
  it('returns 200 with empty entries by default', async () => {
    const res = await request(createApp()).get('/api/v1/analytics/active-users');
    expect(res.status).toBe(200);
    expect(res.body.data.entries).toEqual([]);
  });

  it('returns active users time-series with day granularity', async () => {
    db.analyticsDaily.findMany.mockResolvedValue([
      { date: new Date('2026-07-24T00:00:00Z'), activeUsers: 4 },
      { date: new Date('2026-07-25T00:00:00Z'), activeUsers: 6 },
    ]);

    const result = await getActiveUsers('day');

    expect(result.entries).toEqual([
      { date: '2026-07-24', activeUsers: 4 },
      { date: '2026-07-25', activeUsers: 6 },
    ]);
  });

  it('returns 400 for invalid granularity', async () => {
    const res = await request(createApp()).get('/api/v1/analytics/active-users?granularity=year');
    expect(res.status).toBe(400);
  });
});

describe('computeDailyAnalytics', () => {
  it('computes the day in SQL, upserts the rollup and invalidates cached rollup reads', async () => {
    db.$queryRaw
      .mockResolvedValueOnce([{ totalTips: 3, totalVolume: 450000000n }])
      .mockResolvedValueOnce([{ activeUsers: 3 }]);
    db.user.count.mockResolvedValue(2);
    db.analyticsDaily.upsert.mockResolvedValue({
      date: new Date('2026-07-24T00:00:00.000Z'),
      totalTips: 3,
      totalVolume: BigInt(450000000),
      newUsers: 2,
      activeUsers: 3,
    });

    const result = await computeDailyAnalytics('2026-07-24');

    expect(result).toEqual({ date: '2026-07-24', totalTips: 3, totalVolume: '450000000', newUsers: 2, activeUsers: 3 });
    const values = { totalTips: 3, totalVolume: BigInt(450000000), newUsers: 2, activeUsers: 3 };
    expect(db.analyticsDaily.upsert).toHaveBeenCalledWith({
      where: { date: new Date('2026-07-24T00:00:00.000Z') },
      create: { date: new Date('2026-07-24T00:00:00.000Z'), ...values },
      update: values,
    });
    expect(rawCalls()[1].sql).toContain('UNION');
    expect(mockInvalidateRollup).toHaveBeenCalledOnce();
    expect(db.analyticsDaily.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      mockInvalidateRollup.mock.invocationCallOrder[0],
    );
  });

  it('handles days with no tips or users', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ totalTips: 0, totalVolume: 0n }]).mockResolvedValueOnce([{ activeUsers: 0 }]);
    db.analyticsDaily.upsert.mockResolvedValue({
      date: new Date('2026-07-24T00:00:00.000Z'),
      totalTips: 0,
      totalVolume: BigInt(0),
      newUsers: 0,
      activeUsers: 0,
    });

    await expect(computeDailyAnalytics('2026-07-24')).resolves.toEqual({
      date: '2026-07-24',
      totalTips: 0,
      totalVolume: '0',
      newUsers: 0,
      activeUsers: 0,
    });
  });
});

describe('GET /api/v1/analytics/creators/:username', () => {
  const creator = { id: 'user-1', stellarAddress: 'GCREATOR123', username: 'testcreator', displayName: 'Test Creator' };

  function serveCreatorRows(): void {
    db.user.findUnique.mockResolvedValue(creator);
    db.$queryRaw.mockImplementation(async (...call: unknown[]) => {
      const { sql } = sqlOf(call);
      if (sql.includes('MIN("createdAt")')) {
        return [
          {
            count: 4,
            volume: 500000000n,
            tippers: 3,
            first: new Date('2026-07-20T10:00:00Z'),
            last: new Date('2026-07-22T09:00:00Z'),
          },
        ];
      }
      if (sql.includes('"bucket"')) {
        return [
          { bucket: '2026-07-20', count: 1, volume: 100000000n, tippers: 1 },
          { bucket: '2026-07-21', count: 2, volume: 350000000n, tippers: 2 },
          { bucket: '2026-07-22', count: 1, volume: 50000000n, tippers: 1 },
        ];
      }
      return [
        { fromAddress: 'GTIPPER1', total: 250000000n, count: 2 },
        { fromAddress: 'GTIPPER2', total: 200000000n, count: 1 },
        { fromAddress: 'GTIPPER3', total: 50000000n, count: 1 },
      ];
    });
    db.user.findMany.mockResolvedValue([
      { id: 'tipper-1', stellarAddress: 'GTIPPER1', username: 'tipper1', displayName: 'Tipper One' },
    ]);
  }

  it('returns 404 for non-existent creator', async () => {
    const res = await request(createApp()).get('/api/v1/analytics/creators/nonexistent');
    expect(res.status).toBe(404);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing username segment', async () => {
    const res = await request(createApp()).get('/api/v1/analytics/creators/');
    expect(res.status).toBe(404);
  });

  it('returns summary, time series and top tippers', async () => {
    serveCreatorRows();

    const res = await request(createApp()).get('/api/v1/analytics/creators/testcreator');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      summary: {
        totalTipsReceived: 4,
        totalVolumeReceived: '500000000',
        uniqueTippers: 3,
        averageTipSize: '125000000',
        firstTipDate: '2026-07-20',
        lastTipDate: '2026-07-22',
      },
      timeSeries: [
        { date: '2026-07-20', totalTips: 1, totalVolume: '100000000', uniqueTippers: 1 },
        { date: '2026-07-21', totalTips: 2, totalVolume: '350000000', uniqueTippers: 2 },
        { date: '2026-07-22', totalTips: 1, totalVolume: '50000000', uniqueTippers: 1 },
      ],
      topTippers: [
        { userId: 'tipper-1', stellarAddress: 'GTIPPER1', username: 'tipper1', displayName: 'Tipper One', totalTipsStroops: '250000000', tipCount: 2 },
        { userId: '', stellarAddress: 'GTIPPER2', username: null, displayName: null, totalTipsStroops: '200000000', tipCount: 1 },
        { userId: '', stellarAddress: 'GTIPPER3', username: null, displayName: null, totalTipsStroops: '50000000', tipCount: 1 },
      ],
      granularity: 'day',
      period: { start: null, end: null },
    });
  });

  it('filters every query to the creator, confirmed tips and the UTC range', async () => {
    serveCreatorRows();

    await getCreatorAnalytics('testcreator', '2026-07-20', '2026-07-21', 'week');

    for (const { sql, values } of rawCalls()) {
      expect(sql).toContain(`"toAddress" =`);
      expect(sql).toContain(`"status" = 'CONFIRMED'`);
      expect(values).toEqual(
        expect.arrayContaining(['GCREATOR123', new Date('2026-07-20'), new Date('2026-07-21')]),
      );
    }
    expect(rawCalls()[2].sql).toMatch(/ORDER BY "total" DESC, "fromAddress" COLLATE "C" ASC\s+LIMIT 10/);
  });

  it('returns empty analytics for creator with no tips', async () => {
    db.user.findUnique.mockResolvedValue(creator);
    db.$queryRaw
      .mockResolvedValueOnce([{ count: 0, volume: 0n, tippers: 0, first: null, last: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await request(createApp()).get('/api/v1/analytics/creators/testcreator');

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({
      totalTipsReceived: 0,
      totalVolumeReceived: '0',
      uniqueTippers: 0,
      averageTipSize: '0',
      firstTipDate: null,
      lastTipDate: null,
    });
    expect(res.body.data.timeSeries).toEqual([]);
    expect(res.body.data.topTippers).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid date format', async () => {
    const res = await request(createApp()).get('/api/v1/analytics/creators/testcreator?startDate=invalid-date');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid granularity', async () => {
    const res = await request(createApp()).get('/api/v1/analytics/creators/testcreator?granularity=invalid');
    expect(res.status).toBe(400);
  });
});

describe('analytics query-count regressions (issue #1265)', () => {
  it.each([
    ['daily', () => getDailyAnalytics(undefined, undefined, 30, 0), 2],
    ['summary', () => getAnalyticsSummary(undefined, undefined), 1],
    ['volume (rollup + raw edges)', () => getTipVolume('week'), 2],
    ['active users', () => getActiveUsers('month'), 1],
  ])('%s runs a fixed number of queries', async (_name, run, expected) => {
    countEveryQuery();
    const { count } = await countQueries(run as () => Promise<unknown>);
    expect(count).toBe(expected);
  });

  it('computeDailyAnalytics runs 4 queries (3 aggregates + upsert) regardless of tip volume', async () => {
    db.$queryRaw.mockImplementation(async (...call: unknown[]) =>
      sqlOf(call).sql.includes('UNION')
        ? [{ activeUsers: 50_000 }]
        : [{ totalTips: 100_000, totalVolume: 10n ** 15n }],
    );
    db.analyticsDaily.upsert.mockResolvedValue({
      date: new Date('2026-07-24T00:00:00Z'),
      totalTips: 100_000,
      totalVolume: 10n ** 15n,
      newUsers: 0,
      activeUsers: 50_000,
    });
    countEveryQuery();

    const { count } = await countQueries(() => computeDailyAnalytics('2026-07-24'));
    expect(count).toBe(4);
  });

  it('top tippers runs a constant 3 queries for any page size (no N+1)', async () => {
    db.$queryRaw.mockImplementation(async (...call: unknown[]) => {
      const { sql, values } = sqlOf(call);
      if (sql.includes('MAX("rank")')) return [{ ranked: 1000 }];
      const limit = Number(values[1]); // WHERE "rank" > $1 ... LIMIT $2
      return Array.from({ length: limit }, (_, i) => ({ fromAddress: `G${i}`, total: 10n, count: 1 }));
    });
    countEveryQuery();

    await assertConstantQueryCount((pageSize) => getTopTippers(1, pageSize), [1, 50]);
    const { count } = await countQueries(() => getTopTippers(1, 50));
    expect(count).toBe(3);
  });

  it('creator analytics runs a constant 5 queries however many tips or tippers there are', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u', stellarAddress: 'GC', username: 'c', displayName: null });
    let tippers = 1;
    db.$queryRaw.mockImplementation(async (...call: unknown[]) => {
      const { sql } = sqlOf(call);
      if (sql.includes('MIN("createdAt")')) return [{ count: 1_000_000, volume: 1n, tippers, first: null, last: null }];
      if (sql.includes('"bucket"')) return [];
      return Array.from({ length: tippers }, (_, i) => ({ fromAddress: `G${i}`, total: 1n, count: 1 }));
    });
    countEveryQuery();

    await assertConstantQueryCount(async (size) => {
      tippers = size;
      return getCreatorAnalytics('c', undefined, undefined, 'day');
    }, [1, 10]);
    const { count } = await countQueries(() => getCreatorAnalytics('c', undefined, undefined, 'day'));
    expect(count).toBe(5);
  });

  it('keeps service time bounded when the database reports huge aggregates', async () => {
    // Before #1265 the service pulled every tip into memory; now the database
    // returns one row per bucket, so service time no longer grows with tips.
    db.user.findUnique.mockResolvedValue({ id: 'u', stellarAddress: 'GC', username: 'c', displayName: null });
    const days = Array.from({ length: 365 }, (_, i) => ({
      bucket: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      count: 5_000,
      volume: 10n ** 12n,
      tippers: 1_000,
    }));
    db.$queryRaw.mockImplementation(async (...call: unknown[]) => {
      const { sql } = sqlOf(call);
      if (sql.includes('MIN("createdAt")')) return [{ count: 1_825_000, volume: 10n ** 15n, tippers: 90_000, first: new Date(), last: new Date() }];
      if (sql.includes('"bucket"')) return days;
      return Array.from({ length: 10 }, (_, i) => ({ fromAddress: `G${i}`, total: 1n, count: 1 }));
    });

    const started = performance.now();
    const result = await getCreatorAnalytics('c', '2026-01-01', '2026-12-31', 'day');
    expect(performance.now() - started).toBeLessThan(50);
    expect(result.timeSeries).toHaveLength(365);
  });
});
