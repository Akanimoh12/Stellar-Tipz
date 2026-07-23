import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import type { LeaderboardEntry, LeaderboardResponse } from './leaderboard.types.js';
import type { TimeWindow } from './leaderboard.schema.js';

const WINDOW_MS: Record<Exclude<TimeWindow, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

function getSince(window: TimeWindow): Date | undefined {
  if (window === 'all') return undefined;
  return new Date(Date.now() - WINDOW_MS[window]);
}

export async function getLeaderboard(
  window: TimeWindow,
  limit: number,
  offset: number,
): Promise<LeaderboardResponse> {
  const since = getSince(window);

  const rows = await prisma.tip.groupBy({
    by: ['toAddress'],
    where: {
      status: 'CONFIRMED',
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    _sum: { amountStroops: true },
    orderBy: { _sum: { amountStroops: 'desc' } },
    take: limit,
    skip: offset,
  });

  const addresses = rows.map((r) => r.toAddress);

  const users = await prisma.user.findMany({
    where: { stellarAddress: { in: addresses } },
    select: { id: true, username: true, stellarAddress: true },
  });

  const userMap = new Map(users.map((u) => [u.stellarAddress, u]));

  const data: LeaderboardEntry[] = rows.map((row, index) => {
    const user = userMap.get(row.toAddress);
    return {
      rank: offset + index + 1,
      userId: user?.id ?? '',
      username: user?.username ?? null,
      stellarAddress: row.toAddress,
      totalTips: row._sum.amountStroops?.toString() ?? '0',
    };
  });

  return { data, window };
}

export async function getUserRank(
  userId: string,
  window: TimeWindow,
): Promise<{ rank: number; totalTips: string; window: TimeWindow }> {
  const since = getSince(window);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stellarAddress: true },
  });

  if (!user || !user.stellarAddress) {
    throw new NotFoundError('User not found');
  }

  const allRows = await prisma.tip.groupBy({
    by: ['toAddress'],
    where: {
      status: 'CONFIRMED',
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    _sum: { amountStroops: true },
    orderBy: { _sum: { amountStroops: 'desc' } },
  });

  const userEntry = allRows.find((r) => r.toAddress === user.stellarAddress);

  if (!userEntry) {
    throw new NotFoundError('User not found on the leaderboard for this window');
  }

  const rank = allRows.indexOf(userEntry) + 1;

  return { rank, totalTips: userEntry._sum.amountStroops?.toString() ?? '0', window };
}
