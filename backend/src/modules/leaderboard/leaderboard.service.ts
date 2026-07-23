import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import type { LeaderboardEntry, LeaderboardResponse } from './leaderboard.types.js';

export async function getLeaderboard(
  period: 'WEEKLY' | 'MONTHLY' | 'ALL_TIME',
  limit: number,
  offset: number,
): Promise<LeaderboardResponse> {
  const rows = await prisma.leaderboardSnapshot.findMany({
    where: { period },
    orderBy: { rank: 'asc' },
    take: limit,
    skip: offset,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          stellarAddress: true,
        },
      },
    },
  });

  const data: LeaderboardEntry[] = rows.map((row) => ({
    rank: row.rank,
    userId: row.userId,
    username: row.user.username,
    stellarAddress: row.user.stellarAddress,
    totalTips: row.totalTips.toString(),
  }));

  return { data, period };
}

export async function getUserRank(
  userId: string,
  period: 'WEEKLY' | 'MONTHLY' | 'ALL_TIME',
): Promise<{ rank: number; totalTips: string }> {
  const entry = await prisma.leaderboardSnapshot.findFirst({
    where: { userId, period },
  });

  if (!entry) {
    throw new NotFoundError('User not found on the leaderboard for this period');
  }

  return { rank: entry.rank, totalTips: entry.totalTips.toString() };
}
