import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import type { AnalyticsDailyResponse, AnalyticsSummary } from './analytics.types.js';
import type { TipVolumeResponse, TopTipperEntry, TopTippersResponse } from './analytics.types.js';
import type { ActiveUsersResponse } from './analytics.types.js';

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

  const rows = await prisma.analyticsDaily.findMany({ where });

  const totals = rows.reduce(
    (acc, row) => ({
      totalTips: acc.totalTips + row.totalTips,
      totalVolume: acc.totalVolume + BigInt(row.totalVolume.toString()),
      totalNewUsers: acc.totalNewUsers + row.newUsers,
      totalActiveUsers: acc.totalActiveUsers + row.activeUsers,
    }),
    { totalTips: 0, totalVolume: BigInt(0), totalNewUsers: 0, totalActiveUsers: 0 },
  );

  return {
    totalTips: totals.totalTips,
    totalVolume: totals.totalVolume.toString(),
    totalNewUsers: totals.totalNewUsers,
    totalActiveUsers: totals.totalActiveUsers,
    period: {
      start: startDate ?? null,
      end: endDate ?? null,
    },
  };
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

  const now = new Date();
  const start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : now;

  const tips = await prisma.tip.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      status: 'COMPLETED',
    },
    select: { amountStroops: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const buckets = new Map<string, { totalStroops: bigint; count: number }>();

  for (const tip of tips) {
    let key: string;
    const d = new Date(tip.createdAt);

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

    const existing = buckets.get(key);
    if (existing) {
      existing.totalStroops += tip.amountStroops;
      existing.count += 1;
    } else {
      buckets.set(key, { totalStroops: tip.amountStroops, count: 1 });
    }
  }

  const entries = Array.from(buckets.entries()).map(([date, data]) => ({
    date,
    totalTips: data.totalStroops.toString(),
    count: data.count,
  }));

  return {
    entries,
    granularity,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

/**
 * Returns top tippers ranked by total stroops sent (issue #1009).
 */
export async function getTopTippers(
  page: number,
  limit: number,
): Promise<TopTippersResponse> {
  logger.info({ page, limit }, 'Fetching top tippers');

  const skip = (page - 1) * limit;

  const grouped = await prisma.tip.groupBy({
    by: ['fromAddress'],
    _sum: { amountStroops: true },
    _count: true,
    orderBy: { _sum: { amountStroops: 'desc' } },
    skip,
    take: limit,
  });

  const total = (await prisma.tip.groupBy({ by: ['fromAddress'] })).length;

  const entries: TopTipperEntry[] = await Promise.all(
    grouped.map(async (row) => {
      const user = await prisma.user.findUnique({
        where: { stellarAddress: row.fromAddress },
        select: {
          id: true,
          stellarAddress: true,
          username: true,
          displayName: true,
        },
      });
      return {
        userId: user?.id ?? '',
        stellarAddress: row.fromAddress,
        username: user?.username ?? null,
        displayName: user?.displayName ?? null,
        totalTipsStroops: (row._sum.amountStroops ?? 0n).toString(),
        tipCount: row._count,
      };
    }),
  );

  return { entries, total, page, limit };
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

  const now = new Date();
  const start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : now;

  const rows = await prisma.analyticsDaily.findMany({
    where: {
      date: { gte: start, lte: end },
    },
    select: { date: true, activeUsers: true },
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

    const existing = buckets.get(key);
    if (existing !== undefined) {
      buckets.set(key, existing + row.activeUsers);
    } else {
      buckets.set(key, row.activeUsers);
    }
  }

  const entries = Array.from(buckets.entries()).map(([date, activeUsers]) => ({
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
