import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { utcTimestamp } from '../../db/sql.js';
import { logger } from '../../common/utils/logger.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import { cachedAnalytics, invalidateRollupAnalytics } from './analytics.cache.js';
import type {
  AnalyticsDailyEntry,
  AnalyticsDailyResponse,
  AnalyticsSummary,
} from './analytics.types.js';
import type {
  TipVolumeResponse,
  TopTipperEntry,
  TopTippersResponse,
} from './analytics.types.js';
import type { ActiveUsersResponse, ActiveUsersEntry } from './analytics.types.js';
import type {
  CreatorAnalyticsResponse,
  CreatorAnalyticsSummary,
  CreatorAnalyticsEntry,
  CreatorTopTipperEntry,
} from './analytics.types.js';

/**
 * Query design (issue #1265, profiled in docs/ANALYTICS_PERFORMANCE.md):
 * aggregation and time bucketing run in Postgres, so each endpoint transfers
 * one row per bucket/tipper instead of every matching tip, runs a constant
 * number of queries (profiles are hydrated in one batch), and orders ties
 * deterministically. Results are cached (see analytics.cache.ts).
 */

type Granularity = 'day' | 'week' | 'month';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * UTC time bucket label for a timestamp column: `YYYY-MM-DD` for day and week
 * (weeks start on Sunday) and `YYYY-MM` for month.
 */
function bucketLabel(granularity: string, column = Prisma.sql`"createdAt"`): Prisma.Sql {
  switch (granularity as Granularity) {
    case 'week':
      return Prisma.sql`to_char(date_trunc('week', ${column} + interval '1 day') - interval '1 day', 'YYYY-MM-DD')`;
    case 'month':
      return Prisma.sql`to_char(date_trunc('month', ${column}), 'YYYY-MM')`;
    default:
      return Prisma.sql`to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`;
  }
}

function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Half-open time ranges `[from, to)` not covered by a set of whole UTC days. */
function uncoveredRanges(start: Date, endExclusive: Date, coveredDays: Set<number>): Array<[Date, Date]> {
  const ranges: Array<[Date, Date]> = [];
  let from: number | null = null;
  for (let cursor = start.getTime(); cursor < endExclusive.getTime(); ) {
    const dayStart = utcDayStart(new Date(cursor)).getTime();
    const next = Math.min(dayStart + DAY_MS, endExclusive.getTime());
    if (coveredDays.has(dayStart)) {
      if (from !== null) ranges.push([new Date(from), new Date(cursor)]);
      from = null;
    } else if (from === null) {
      from = cursor;
    }
    cursor = next;
  }
  if (from !== null) ranges.push([new Date(from), endExclusive]);
  return ranges;
}

/** Default analytics window when no start date is given: the last 30 days. */
function resolveRange(startDate?: string, endDate?: string): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    end: endDate ? new Date(endDate) : now,
  };
}

interface ProfileSummary {
  id: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
}

/** Loads the profiles for a set of addresses in a single query. */
async function profilesByAddress(addresses: string[]): Promise<Map<string, ProfileSummary>> {
  if (addresses.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { stellarAddress: { in: addresses } },
    select: { id: true, stellarAddress: true, username: true, displayName: true },
  });
  return new Map(users.map((user) => [user.stellarAddress, user]));
}

/**
 * Returns paginated daily analytics rows, optionally filtered by date range.
 */
export async function getDailyAnalytics(
  startDate: string | undefined,
  endDate: string | undefined,
  limit: number,
  offset: number,
): Promise<AnalyticsDailyResponse> {
  const where: Record<string, unknown> = {};

  if (startDate || endDate) {
    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    where.date = dateFilter;
  }

  return cachedAnalytics({ kind: 'rollup' }, 'daily', { startDate, endDate, limit, offset }, async () => {
    const [rows, total] = await Promise.all([
      prisma.analyticsDaily.findMany({
        where,
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.analyticsDaily.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        totalTips: row.totalTips,
        totalVolume: row.totalVolume.toString(),
        newUsers: row.newUsers,
        activeUsers: row.activeUsers,
      })),
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + rows.length < total,
      },
    };
  });
}

/**
 * Returns an aggregated summary across all daily analytics rows within a date range.
 */
export async function getAnalyticsSummary(
  startDate: string | undefined,
  endDate: string | undefined,
): Promise<AnalyticsSummary> {
  const where: Record<string, unknown> = {};

  if (startDate || endDate) {
    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    where.date = dateFilter;
  }

  return cachedAnalytics({ kind: 'rollup' }, 'summary', { startDate, endDate }, async () => {
    // One aggregate row instead of loading every day into memory.
    const { _sum: totals } = await prisma.analyticsDaily.aggregate({
      where,
      _sum: { totalTips: true, totalVolume: true, newUsers: true, activeUsers: true },
    });

    return {
      totalTips: totals.totalTips ?? 0,
      totalVolume: (totals.totalVolume ?? BigInt(0)).toString(),
      totalNewUsers: totals.newUsers ?? 0,
      totalActiveUsers: totals.activeUsers ?? 0,
      period: {
        start: startDate ?? null,
        end: endDate ?? null,
      },
    };
  });
}

/**
 * Returns tip volume time-series bucketed by granularity (issue #1008).
 */
export async function getTipVolume(
  granularity: string,
  startDate?: string,
  endDate?: string,
): Promise<TipVolumeResponse> {
  logger.info({ granularity, startDate, endDate }, 'Fetching tip volume time-series');

  return cachedAnalytics({ kind: 'platform' }, 'volume', { granularity, startDate, endDate }, async () => {
    const { start, end } = resolveRange(startDate, endDate);
    const endExclusive = new Date(end.getTime() + 1);
    const buckets = new Map<string, { total: bigint; count: number }>();
    const add = (bucket: string, total: bigint, count: number) => {
      const entry = buckets.get(bucket) ?? { total: BigInt(0), count: 0 };
      entry.total += total;
      entry.count += count;
      buckets.set(bucket, entry);
    };

    // Whole UTC days inside the range that closed before today come from the
    // AnalyticsDaily rollup — but only rows the rollup job rewrote after the
    // day ended (same-day rows hold partial live increments).
    const firstWholeDay = new Date(utcDayStart(new Date(start.getTime() + DAY_MS - 1)));
    const wholeDaysEnd = new Date(Math.min(utcDayStart(endExclusive).getTime(), utcDayStart(new Date()).getTime()));
    const covered = new Set<number>();
    if (firstWholeDay < wholeDaysEnd) {
      const rolled = await prisma.$queryRaw<Array<{ day: Date; bucket: string; total: bigint; count: number }>>`
        SELECT "date" AS "day", ${bucketLabel(granularity, Prisma.sql`"date"::timestamp`)} AS "bucket",
               "totalVolume" AS "total", "totalTips" AS "count"
        FROM "AnalyticsDaily"
        WHERE "date" >= ${firstWholeDay.toISOString().slice(0, 10)}::date
          AND "date" < ${wholeDaysEnd.toISOString().slice(0, 10)}::date
          AND "updatedAt" >= "date" + interval '1 day'
      `;
      for (const row of rolled) {
        covered.add(utcDayStart(row.day).getTime());
        add(row.bucket, row.total, row.count);
      }
    }

    // Everything else (partial edge days, today, days without a finished
    // rollup) is aggregated from the raw tips — a small slice of the range.
    const ranges = uncoveredRanges(start, endExclusive, covered);
    if (ranges.length > 0) {
      const inRanges = Prisma.join(
        ranges.map(([from, to]) => Prisma.sql`("createdAt" >= ${utcTimestamp(from)} AND "createdAt" < ${utcTimestamp(to)})`),
        ' OR ',
      );
      const raw = await prisma.$queryRaw<Array<{ bucket: string; total: bigint; count: number }>>`
        SELECT ${bucketLabel(granularity)} AS "bucket", SUM("amountStroops")::bigint AS "total", COUNT(*)::int AS "count"
        FROM "Tip"
        WHERE "status" = 'CONFIRMED' AND (${inRanges})
        GROUP BY 1
      `;
      for (const row of raw) add(row.bucket, row.total, row.count);
    }

    return {
      entries: [...buckets.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([date, bucket]) => ({ date, totalTips: bucket.total.toString(), count: bucket.count })),
      granularity,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  });
}

/**
 * Returns top tippers ranked by total stroops sent (issue #1009).
 */
export async function getTopTippers(
  page: number,
  limit: number,
): Promise<TopTippersResponse> {
  logger.info({ page, limit }, 'Fetching top tippers');

  return cachedAnalytics({ kind: 'platform' }, 'top-tippers', { page, limit }, async () => {
    const skip = (page - 1) * limit;

    // Read one indexed page of the precomputed ranking (see refreshTipperRollup).
    const [{ ranked }] = await prisma.$queryRaw<Array<{ ranked: number | null }>>`
      SELECT MAX("rank") AS "ranked" FROM "TipperRollup"
    `;
    let rows: Array<{ fromAddress: string; total: bigint; count: number }>;
    let total: number;
    if (ranked !== null) {
      total = ranked;
      rows = await prisma.$queryRaw`
        SELECT "fromAddress", "totalStroops" AS "total", "tipCount" AS "count"
        FROM "TipperRollup"
        WHERE "rank" > ${skip}
        ORDER BY "rank" ASC
        LIMIT ${limit}
      `;
    } else {
      // The rollup has not been built yet: aggregate live, same order.
      const [page, [counted]] = await Promise.all([
        prisma.$queryRaw<Array<{ fromAddress: string; total: bigint; count: number }>>`
          SELECT "fromAddress", SUM("amountStroops")::bigint AS "total", COUNT(*)::int AS "count"
          FROM "Tip"
          GROUP BY "fromAddress"
          ORDER BY "total" DESC, "fromAddress" COLLATE "C" ASC
          LIMIT ${limit} OFFSET ${skip}
        `,
        // A hashed GROUP BY avoids COUNT(DISTINCT)'s sort of every row.
        prisma.$queryRaw<Array<{ total: bigint }>>`
          SELECT COUNT(*) AS "total" FROM (SELECT 1 FROM "Tip" GROUP BY "fromAddress") AS "tippers"
        `,
      ]);
      rows = page;
      total = Number(counted?.total ?? 0);
    }
    const profiles = await profilesByAddress(rows.map((row) => row.fromAddress));

    const entries: TopTipperEntry[] = rows.map((row) => {
      const user = profiles.get(row.fromAddress);
      return {
        userId: user?.id ?? '',
        stellarAddress: row.fromAddress,
        username: user?.username ?? null,
        displayName: user?.displayName ?? null,
        totalTipsStroops: row.total.toString(),
        tipCount: row.count,
      };
    });

    return { entries, total, page, limit };
  });
}

/**
 * Rebuilds the ranked TipperRollup from all tips in one transaction. DELETE
 * (not TRUNCATE) keeps it MVCC-safe: readers see the previous ranking until
 * the new one commits, and are never blocked. Rows are inserted in rank order
 * so the rank B-tree is append-only. Run by the analytics rollup job; returns
 * the number of ranked tippers.
 */
export async function refreshTipperRollup(): Promise<number> {
  const [, , ranked] = await prisma.$transaction([
    // Keep the ranking sort in memory for this transaction only.
    prisma.$executeRaw`SET LOCAL work_mem = '64MB'`,
    prisma.$executeRaw`DELETE FROM "TipperRollup"`,
    prisma.$executeRaw`
      INSERT INTO "TipperRollup" ("rank", "fromAddress", "totalStroops", "tipCount", "refreshedAt")
      SELECT ROW_NUMBER() OVER (ORDER BY SUM("amountStroops") DESC, "fromAddress" COLLATE "C" ASC) AS "rank",
             "fromAddress",
             SUM("amountStroops")::bigint,
             COUNT(*)::int,
             now()
      FROM "Tip"
      GROUP BY "fromAddress"
      ORDER BY "rank"
    `,
  ]);
  await invalidateRollupAnalytics();
  logger.info({ ranked }, 'Top-tippers rollup rebuilt');
  return ranked;
}

/**
 * Returns active users time-series bucketed by granularity (issue #1010).
 */
export async function getActiveUsers(
  granularity: string,
  startDate?: string,
  endDate?: string,
): Promise<ActiveUsersResponse> {
  logger.info({ granularity, startDate, endDate }, 'Fetching active users time-series');

  return cachedAnalytics({ kind: 'rollup' }, 'active-users', { granularity, startDate, endDate }, () =>
    computeActiveUsers(granularity, startDate, endDate),
  );
}

async function computeActiveUsers(
  granularity: string,
  startDate?: string,
  endDate?: string,
): Promise<ActiveUsersResponse> {
  const { start, end } = resolveRange(startDate, endDate);

  // At most one row per day from the rollup table, so bucketing here is cheap.
  const rows = await prisma.analyticsDaily.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
  });

  const buckets = new Map<string, number>();

  for (const row of rows) {
    let key: string;
    const d = new Date(row.date);

    switch (granularity) {
      case 'week': {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = startOfWeek.toISOString().slice(0, 10);
        break;
      }
      case 'month':
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        key = d.toISOString().slice(0, 10);
        break;
    }

    buckets.set(key, (buckets.get(key) ?? 0) + row.activeUsers);
  }

  const entries: ActiveUsersEntry[] = Array.from(buckets.entries()).map(([date, activeUsers]) => ({
    date,
    activeUsers,
  }));

  return {
    entries,
    granularity,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

/**
 * Compute and upsert daily analytics for a given calendar date.
 *
 * Queries completed tips and registered users for that day, then upserts a
 * single AnalyticsDaily row. Idempotent — safe to run multiple times for the
 * same date.
 */
export async function computeDailyAnalytics(date: string): Promise<AnalyticsDailyEntry> {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const from = utcTimestamp(dayStart);
  const to = utcTimestamp(dayEnd);

  const [[tipTotals], [active], newUsersCount] = await Promise.all([
    prisma.$queryRaw<Array<{ totalTips: number; totalVolume: bigint }>>`
      SELECT COUNT(*)::int AS "totalTips", COALESCE(SUM("amountStroops"), 0)::bigint AS "totalVolume"
      FROM "Tip"
      WHERE "status" = 'CONFIRMED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
    `,
    // Distinct senders and receivers, de-duplicated across both roles in SQL.
    prisma.$queryRaw<Array<{ activeUsers: number }>>`
      SELECT COUNT(*)::int AS "activeUsers" FROM (
        SELECT "fromAddress" AS "address" FROM "Tip"
        WHERE "status" = 'CONFIRMED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        UNION
        SELECT "toAddress" FROM "Tip"
        WHERE "status" = 'CONFIRMED' AND "createdAt" >= ${from} AND "createdAt" <= ${to}
      ) AS "active"
    `,
    prisma.user.count({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
        deletedAt: null,
      },
    }),
  ]);

  const totalTips = tipTotals?.totalTips ?? 0;
  const totalVolume = tipTotals?.totalVolume ?? BigInt(0);
  const activeUsers = active?.activeUsers ?? 0;

  const upserted = await prisma.analyticsDaily.upsert({
    where: { date: dayStart },
    create: {
      date: dayStart,
      totalTips,
      totalVolume,
      newUsers: newUsersCount,
      activeUsers,
    },
    update: {
      totalTips,
      totalVolume,
      newUsers: newUsersCount,
      activeUsers,
    },
  });
  // Cached rollup reads (daily, summary, active users) now reflect this day.
  await invalidateRollupAnalytics();

  logger.info(
    { date, totalTips, totalVolume: totalVolume.toString(), newUsers: newUsersCount, activeUsers },
    'Daily analytics computed',
  );

  return {
    date: upserted.date.toISOString().slice(0, 10),
    totalTips: upserted.totalTips,
    totalVolume: upserted.totalVolume.toString(),
    newUsers: upserted.newUsers,
    activeUsers: upserted.activeUsers,
  };
}

/**
 * Returns analytics for a specific creator identified by username.
 * Includes summary stats, time-series data, and top tippers.
 */
export async function getCreatorAnalytics(
  username: string,
  startDate: string | undefined,
  endDate: string | undefined,
  granularity: string,
): Promise<CreatorAnalyticsResponse> {
  logger.info({ username, startDate, endDate, granularity }, 'Fetching creator analytics');

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, stellarAddress: true, username: true, displayName: true },
  });

  if (!user) {
    throw new NotFoundError('Creator not found');
  }

  return cachedAnalytics(
    { kind: 'creator', address: user.stellarAddress },
    'creator',
    { startDate, endDate, granularity },
    () => computeCreatorAnalytics(user.stellarAddress, startDate, endDate, granularity),
  );
}

async function computeCreatorAnalytics(
  address: string,
  startDate: string | undefined,
  endDate: string | undefined,
  granularity: string,
): Promise<CreatorAnalyticsResponse> {
  const { start, end } = resolveRange(startDate, endDate);
  const received = Prisma.sql`
    "toAddress" = ${address} AND "status" = 'CONFIRMED'
    AND "createdAt" >= ${utcTimestamp(start)} AND "createdAt" <= ${utcTimestamp(end)}
  `;

  const [[totals], series, tippers] = await Promise.all([
    prisma.$queryRaw<
      Array<{ count: number; volume: bigint; tippers: number; first: Date | null; last: Date | null }>
    >`
      SELECT COUNT(*)::int AS "count", COALESCE(SUM("amountStroops"), 0)::bigint AS "volume",
             COUNT(DISTINCT "fromAddress" COLLATE "C")::int AS "tippers",
             MIN("createdAt") AS "first", MAX("createdAt") AS "last"
      FROM "Tip" WHERE ${received}
    `,
    prisma.$queryRaw<Array<{ bucket: string; count: number; volume: bigint; tippers: number }>>`
      SELECT ${bucketLabel(granularity)} AS "bucket", COUNT(*)::int AS "count",
             SUM("amountStroops")::bigint AS "volume", COUNT(DISTINCT "fromAddress" COLLATE "C")::int AS "tippers"
      FROM "Tip" WHERE ${received}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ fromAddress: string; total: bigint; count: number }>>`
      SELECT "fromAddress", SUM("amountStroops")::bigint AS "total", COUNT(*)::int AS "count"
      FROM "Tip" WHERE ${received}
      GROUP BY "fromAddress"
      ORDER BY "total" DESC, "fromAddress" COLLATE "C" ASC
      LIMIT 10
    `,
  ]);
  const profiles = await profilesByAddress(tippers.map((row) => row.fromAddress));

  const totalTipsReceived = totals?.count ?? 0;
  const totalVolumeReceived = totals?.volume ?? BigInt(0);

  const summary: CreatorAnalyticsSummary = {
    totalTipsReceived,
    totalVolumeReceived: totalVolumeReceived.toString(),
    uniqueTippers: totals?.tippers ?? 0,
    averageTipSize:
      totalTipsReceived > 0 ? (totalVolumeReceived / BigInt(totalTipsReceived)).toString() : '0',
    firstTipDate: totals?.first ? totals.first.toISOString().slice(0, 10) : null,
    lastTipDate: totals?.last ? totals.last.toISOString().slice(0, 10) : null,
  };

  const timeSeries: CreatorAnalyticsEntry[] = series.map((row) => ({
    date: row.bucket,
    totalTips: row.count,
    totalVolume: row.volume.toString(),
    uniqueTippers: row.tippers,
  }));

  const topTippers: CreatorTopTipperEntry[] = tippers.map((row) => {
    const tipper = profiles.get(row.fromAddress);
    return {
      userId: tipper?.id ?? '',
      stellarAddress: row.fromAddress,
      username: tipper?.username ?? null,
      displayName: tipper?.displayName ?? null,
      totalTipsStroops: row.total.toString(),
      tipCount: row.count,
    };
  });

  return {
    summary,
    timeSeries,
    topTippers,
    granularity,
    period: {
      start: startDate ?? null,
      end: endDate ?? null,
    },
  };
}
