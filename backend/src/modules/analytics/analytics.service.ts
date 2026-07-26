import { prisma } from '../../db/prisma.js';
import type { AnalyticsDailyResponse, AnalyticsSummary } from './analytics.types.js';

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
