import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import type { SnapshotPeriod, TimeWindow } from './leaderboard.schema.js';
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardSnapshotResult,
} from './leaderboard.types.js';

const WINDOW_MS: Record<Exclude<TimeWindow, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const SNAPSHOT_WINDOW_MS: Record<Exclude<SnapshotPeriod, 'ALL_TIME'>, number> = {
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
  MONTHLY: 30 * 24 * 60 * 60 * 1000,
};

function getSince(window: TimeWindow, now = new Date()): Date | undefined {
  if (window === 'all') return undefined;
  return new Date(now.getTime() - WINDOW_MS[window]);
}

function getSnapshotSince(period: SnapshotPeriod, now = new Date()): Date | undefined {
  if (period === 'ALL_TIME') return undefined;
  return new Date(now.getTime() - SNAPSHOT_WINDOW_MS[period]);
}

async function getRankedRows(since: Date | undefined, limit?: number, offset?: number) {
  return prisma.tip.groupBy({
    by: ['toAddress'],
    where: {
      status: 'CONFIRMED',
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    _sum: { amountStroops: true },
    orderBy: { _sum: { amountStroops: 'desc' } },
    ...(limit === undefined ? {} : { take: limit }),
    ...(offset === undefined ? {} : { skip: offset }),
  });
}

async function countRankedRows(since: Date | undefined): Promise<number> {
  const rows = await prisma.tip.groupBy({
    by: ['toAddress'],
    where: {
      status: 'CONFIRMED',
      ...(since ? { createdAt: { gte: since } } : {}),
    },
  });

  return rows.length;
}

async function hydrateEntries(
  rows: Awaited<ReturnType<typeof getRankedRows>>,
  offset: number,
): Promise<LeaderboardEntry[]> {
  const addresses = rows.map((row) => row.toAddress);
  const users = await prisma.user.findMany({
    where: { stellarAddress: { in: addresses } },
    select: { id: true, username: true, stellarAddress: true },
  });
  const userMap = new Map(users.map((user) => [user.stellarAddress, user]));

  return rows.map((row, index) => {
    const user = userMap.get(row.toAddress);
    return {
      rank: offset + index + 1,
      userId: user?.id ?? '',
      username: user?.username ?? null,
      stellarAddress: row.toAddress,
      totalTips: row._sum.amountStroops?.toString() ?? '0',
    };
  });
}

/** Returns creators ranked by confirmed tip volume with limit/offset pagination. */
export async function getLeaderboard(
  window: TimeWindow,
  limit: number,
  offset: number,
): Promise<LeaderboardResponse> {
  const since = getSince(window);
  const [rows, total] = await Promise.all([
    getRankedRows(since, limit, offset),
    countRankedRows(since),
  ]);
  const data = await hydrateEntries(rows, offset);

  return {
    data,
    window,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + data.length < total,
    },
  };
}

/** Returns a single user's rank for the requested leaderboard window. */
export async function getUserRank(
  userId: string,
  window: TimeWindow,
): Promise<{ rank: number; totalTips: string; window: TimeWindow }> {
  const since = getSince(window);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stellarAddress: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const rows = await getRankedRows(since);
  const index = rows.findIndex((row) => row.toAddress === user.stellarAddress);

  if (index === -1) {
    throw new NotFoundError('User not found on the leaderboard for this window');
  }

  return {
    rank: index + 1,
    totalTips: rows[index]._sum.amountStroops?.toString() ?? '0',
    window,
  };
}

/** Rebuilds stored leaderboard snapshots for a period from confirmed tip volume. */
export async function createLeaderboardSnapshot(
  period: SnapshotPeriod,
  now = new Date(),
): Promise<LeaderboardSnapshotResult> {
  const since = getSnapshotSince(period, now);
  const rows = await getRankedRows(since);
  const addresses = rows.map((row) => row.toAddress);
  const users = await prisma.user.findMany({
    where: { stellarAddress: { in: addresses } },
    select: { id: true, stellarAddress: true },
  });
  const userMap = new Map(users.map((user) => [user.stellarAddress, user]));

  const data = rows.flatMap((row, index) => {
    const user = userMap.get(row.toAddress);
    if (!user) return [];
    return {
      period,
      rank: index + 1,
      userId: user.id,
      totalTips: row._sum.amountStroops ?? BigInt(0),
    };
  });

  await prisma.$transaction([
    prisma.leaderboardSnapshot.deleteMany({ where: { period } }),
    ...(data.length > 0 ? [prisma.leaderboardSnapshot.createMany({ data })] : []),
  ]);

  return { period, entriesCreated: data.length };
}
