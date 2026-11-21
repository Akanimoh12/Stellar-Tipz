import { prisma } from '../../db/prisma.js';
import { utcTimestamp } from '../../db/sql.js';
import { logger } from '../../common/utils/logger.js';
import { invalidateRollupAnalytics } from './analytics.cache.js';
import type { AnalyticsDailyEntry } from './analytics.types.js';

/**
 * Write side of analytics: the jobs that precompute the AnalyticsDaily and
 * TipperRollup tables read by analytics.query.ts. Both invalidate the cached
 * rollup reads once they commit.
 */

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
