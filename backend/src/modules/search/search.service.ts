import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import type { SearchCreatorsResponse, TrendingCreatorEntry, TrendingCreatorsResponse } from './search.types.js';

const WINDOW_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * Searches creators by name or username using case-insensitive partial matching.
 * Returns paginated results ordered by relevance (username match first, then displayName).
 */
export async function searchCreators(
  query: string,
  limit: number,
  offset: number,
): Promise<SearchCreatorsResponse> {
  const where = {
    deletedAt: null,
    OR: [
      { username: { contains: query, mode: 'insensitive' as const } },
      { displayName: { contains: query, mode: 'insensitive' as const } },
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        displayName: true,
        stellarAddress: true,
        imageUrl: true,
        bio: true,
      },
      orderBy: [
        { username: 'asc' },
        { displayName: 'asc' },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: rows,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + rows.length < total,
    },
  };
}

/**
 * Returns trending creators ranked by confirmed tip volume within a time window.
 * Supports 24h, 7d, and 30d windows with pagination (issue #1016).
 */
export async function getTrendingCreators(
  window: string,
  limit: number,
  offset: number,
): Promise<TrendingCreatorsResponse> {
  logger.info({ window, limit, offset }, 'Fetching trending creators');

  const since = new Date(Date.now() - WINDOW_MS[window]);
  const tipWhere = {
    status: 'CONFIRMED' as const,
    createdAt: { gte: since },
  };

  const [grouped, total] = await Promise.all([
    prisma.tip.groupBy({
      by: ['toAddress'],
      where: tipWhere,
      _sum: { amountStroops: true },
      _count: true,
      orderBy: { _sum: { amountStroops: 'desc' } },
      take: limit,
      skip: offset,
    }),
    (await prisma.tip.groupBy({ by: ['toAddress'], where: tipWhere })).length,
  ]);

  const addresses = grouped.map((row) => row.toAddress);
  const users = await prisma.user.findMany({
    where: { stellarAddress: { in: addresses } },
    select: {
      id: true,
      username: true,
      displayName: true,
      stellarAddress: true,
      imageUrl: true,
      bio: true,
    },
  });
  const userMap = new Map(users.map((u) => [u.stellarAddress, u]));

  const data: TrendingCreatorEntry[] = grouped.map((row, index) => {
    const user = userMap.get(row.toAddress);
    return {
      rank: offset + index + 1,
      userId: user?.id ?? '',
      username: user?.username ?? null,
      displayName: user?.displayName ?? null,
      stellarAddress: row.toAddress,
      imageUrl: user?.imageUrl ?? null,
      bio: user?.bio ?? null,
      totalTipsStroops: (row._sum.amountStroops ?? 0n).toString(),
      tipCount: row._count,
    };
  });

  return {
    data,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + data.length < total,
    },
    window,
  };
}
