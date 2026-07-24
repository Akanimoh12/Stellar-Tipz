import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { computeCreditScore } from "../credit/credit.service.js";
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardPeriod,
  LeaderboardVariant,
} from "./leaderboard.types.js";

// ── Tips leaderboard ──────────────────────────────────────────────────────────

/**
 * Returns leaderboard entries ranked by total tips received (stroops).
 * Uses pre-computed LeaderboardSnapshot rows for WEEKLY / MONTHLY views;
 * falls back to a live aggregate for ALL_TIME.
 *
 * Issue #933
 */
async function getTipsLeaderboard(
  period: LeaderboardPeriod,
  page: number,
  limit: number,
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  if (period !== "ALL_TIME") {
    // Use periodic snapshots for fast pre-aggregated reads.
    const skip = (page - 1) * limit;

    const [snapshots, total] = await Promise.all([
      prisma.leaderboardSnapshot.findMany({
        where: { period },
        orderBy: { rank: "asc" },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              stellarAddress: true,
              username: true,
              displayName: true,
            },
          },
        },
      }),
      prisma.leaderboardSnapshot.count({ where: { period } }),
    ]);

    const entries: LeaderboardEntry[] = snapshots.map((s) => ({
      rank: s.rank,
      userId: s.user.id,
      stellarAddress: s.user.stellarAddress,
      username: s.user.username,
      displayName: s.user.displayName,
      totalTipsStroops: s.totalTips.toString(),
    }));

    return { entries, total };
  }

  // ALL_TIME: aggregate directly from Tip table.
  const skip = (page - 1) * limit;

  // Group tips by recipient address, sum amounts.
  const grouped = await prisma.tip.groupBy({
    by: ["toAddress"],
    _sum: { amountStroops: true },
    orderBy: { _sum: { amountStroops: "desc" } },
    skip,
    take: limit,
  });

  const total = (await prisma.tip.groupBy({ by: ["toAddress"] })).length;

  // Resolve users by stellarAddress for display fields.
  const entries: LeaderboardEntry[] = await Promise.all(
    grouped.map(async (row, index) => {
      const user = await prisma.user.findUnique({
        where: { stellarAddress: row.toAddress },
        select: { id: true, stellarAddress: true, username: true, displayName: true },
      });
      return {
        rank: skip + index + 1,
        userId: user?.id ?? "",
        stellarAddress: row.toAddress,
        username: user?.username ?? null,
        displayName: user?.displayName ?? null,
        totalTipsStroops: (row._sum.amountStroops ?? 0n).toString(),
      };
    }),
  );

  return { entries, total };
}

// ── Credit score leaderboard (issue #933 variant) ────────────────────────────

/**
 * Returns leaderboard entries ranked by live credit score (descending).
 * Scores are computed on the fly using the credit formula (issue #920/#922).
 *
 * NOTE: This is intentionally simple – a production system would cache scores
 * in a CreditScore table and run a background recompute job (issue #919).
 *
 * Issue #933
 */
async function getCreditLeaderboard(
  page: number,
  limit: number,
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      select: {
        id: true,
        stellarAddress: true,
        username: true,
        displayName: true,
        xHandle: true,
      },
      orderBy: { createdAt: "asc" }, // stable pagination order before re-ranking
    }),
    prisma.user.count(),
  ]);

  // Compute credit scores for this page in parallel.
  const scored = await Promise.all(
    users.map(async (user) => {
      try {
        const [tipsSent, tipsReceived, selfTips, streak, xAccount] =
          await Promise.all([
            prisma.tip.count({ where: { fromAddress: user.stellarAddress } }),
            prisma.tip.count({ where: { toAddress: user.stellarAddress } }),
            prisma.tip.count({
              where: {
                fromAddress: user.stellarAddress,
                toAddress: user.stellarAddress,
              },
            }),
            prisma.streak.findUnique({ where: { userId: user.id } }),
            user.xHandle
              ? prisma.xAccount.findUnique({ where: { handle: user.xHandle } })
              : null,
          ]);

        const washTipRatio = tipsSent > 0 ? Math.min(selfTips / tipsSent, 1) : 0;

        const result = computeCreditScore(user.id, {
          tipsSent,
          tipsReceived,
          streak: streak?.currentStreak ?? 0,
          xFollowers: xAccount?.followers ?? 0,
          xEngagement: xAccount?.engagement ?? null,
          selfTips,
          washTipRatio,
        });

        return { user, creditScore: result.score };
      } catch {
        return { user, creditScore: 0 };
      }
    }),
  );

  // Sort descending by credit score, then assign ranks.
  scored.sort((a, b) => b.creditScore - a.creditScore);

  const entries: LeaderboardEntry[] = scored.map((item, index) => ({
    rank: skip + index + 1,
    userId: item.user.id,
    stellarAddress: item.user.stellarAddress,
    username: item.user.username,
    displayName: item.user.displayName,
    creditScore: item.creditScore,
  }));

  return { entries, total };
}

// ── Public service function ───────────────────────────────────────────────────

/**
 * Returns a paginated leaderboard in the requested variant and period.
 *
 * - `variant = "tips"` → ranked by total tips received (stroops).
 * - `variant = "credit"` → ranked by live credit score (issue #933).
 *
 * Issue #933
 */
export async function getLeaderboard(
  variant: LeaderboardVariant,
  period: LeaderboardPeriod,
  page: number,
  limit: number,
): Promise<LeaderboardResponse> {
  logger.info({ variant, period, page, limit }, "Fetching leaderboard");

  const { entries, total } =
    variant === "credit"
      ? await getCreditLeaderboard(page, limit)
      : await getTipsLeaderboard(period, page, limit);

  return { variant, period, entries, total, page, limit };
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
