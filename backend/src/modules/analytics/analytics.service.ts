import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import { NotFoundError } from '../../common/errors/AppError.js';
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
      status: 'CONFIRMED',
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

  // Batch-fetch user profiles for all tippers on this page in a single query
  // instead of one findUnique per row (N+1 fix, issue #1243).
  const addresses = grouped.map((r) => r.fromAddress);
  const users = await prisma.user.findMany({
    where: { stellarAddress: { in: addresses } },
    select: { id: true, stellarAddress: true, username: true, displayName: true },
  });
  const userMap = new Map(users.map((u) => [u.stellarAddress, u]));

  const entries: TopTipperEntry[] = grouped.map((row) => {
    const user = userMap.get(row.fromAddress);
    return {
      userId: user?.id ?? '',
      stellarAddress: row.fromAddress,
      username: user?.username ?? null,
      displayName: user?.displayName ?? null,
      totalTipsStroops: (row._sum.amountStroops ?? 0n).toString(),
      tipCount: row._count,
    };
  });

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

  const [completedTips, newUsers, rawSenderAddresses, rawReceiverAddresses] = await Promise.all([
    prisma.tip.findMany({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
        status: 'CONFIRMED',
      },
      select: { amountStroops: true },
    }),
    prisma.user.findMany({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
        deletedAt: null,
      },
      select: { id: true },
    }),
    prisma.tip.findMany({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
        status: 'CONFIRMED',
      },
      select: { fromAddress: true },
      distinct: ['fromAddress'],
    }),
    prisma.tip.findMany({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
        status: 'CONFIRMED',
      },
      select: { toAddress: true },
      distinct: ['toAddress'],
    }),
  ]);

  const totalTips = completedTips.length;
  const totalVolume = completedTips.reduce((sum, tip) => sum + tip.amountStroops, BigInt(0));
  const newUsersCount = newUsers.length;

  const activeAddresses = new Set<string>();
  for (const { fromAddress } of rawSenderAddresses) activeAddresses.add(fromAddress);
  for (const { toAddress } of rawReceiverAddresses) activeAddresses.add(toAddress);
  const activeUsers = activeAddresses.size;

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

  const now = new Date();
  const start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : now;

  const tips = await prisma.tip.findMany({
    where: {
      toAddress: user.stellarAddress,
      createdAt: { gte: start, lte: end },
      status: 'CONFIRMED',
    },
    select: { amountStroops: true, createdAt: true, fromAddress: true },
    orderBy: { createdAt: 'asc' },
  });

  const totalTipsReceived = tips.length;
  const totalVolumeReceived = tips.reduce((sum, tip) => sum + tip.amountStroops, BigInt(0));
  const uniqueTippers = new Set(tips.map((tip) => tip.fromAddress)).size;
  const averageTipSize =
    totalTipsReceived > 0 ? (totalVolumeReceived / BigInt(totalTipsReceived)).toString() : '0';

  const firstTipDate = tips.length > 0 ? tips[0].createdAt.toISOString().slice(0, 10) : null;
  const lastTipDate = tips.length > 0 ? tips[tips.length - 1].createdAt.toISOString().slice(0, 10) : null;

  const summary: CreatorAnalyticsSummary = {
    totalTipsReceived,
    totalVolumeReceived: totalVolumeReceived.toString(),
    uniqueTippers,
    averageTipSize,
    firstTipDate,
    lastTipDate,
  };

  const buckets = new Map<string, { totalStroops: bigint; count: number; tippers: Set<string> }>();

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
      existing.tippers.add(tip.fromAddress);
    } else {
      buckets.set(key, {
        totalStroops: tip.amountStroops,
        count: 1,
        tippers: new Set([tip.fromAddress]),
      });
    }
  }

  const timeSeries: CreatorAnalyticsEntry[] = Array.from(buckets.entries()).map(([date, data]) => ({
    date,
    totalTips: data.count,
    totalVolume: data.totalStroops.toString(),
    uniqueTippers: data.tippers.size,
  }));

  const tipperMap = new Map<string, { totalStroops: bigint; count: number }>();
  for (const tip of tips) {
    const existing = tipperMap.get(tip.fromAddress);
    if (existing) {
      existing.totalStroops += tip.amountStroops;
      existing.count += 1;
    } else {
      tipperMap.set(tip.fromAddress, { totalStroops: tip.amountStroops, count: 1 });
    }
  }

  const sortedTippers = Array.from(tipperMap.entries())
    .sort((a, b) => (b[1].totalStroops > a[1].totalStroops ? 1 : -1))
    .slice(0, 10);

  // Batch-fetch user profiles for all top tippers in a single query
  // instead of one findUnique per tipper (N+1 fix, issue #1243).
  const tipperAddresses = sortedTippers.map(([address]) => address);
  const tipperUsers = await prisma.user.findMany({
    where: { stellarAddress: { in: tipperAddresses } },
    select: { id: true, stellarAddress: true, username: true, displayName: true },
  });
  const tipperUserMap = new Map(tipperUsers.map((u) => [u.stellarAddress, u]));

  const topTippers: CreatorTopTipperEntry[] = sortedTippers.map(([address, data]) => {
    const tipper = tipperUserMap.get(address);
    return {
      userId: tipper?.id ?? '',
      stellarAddress: address,
      username: tipper?.username ?? null,
      displayName: tipper?.displayName ?? null,
      totalTipsStroops: data.totalStroops.toString(),
      tipCount: data.count,
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
