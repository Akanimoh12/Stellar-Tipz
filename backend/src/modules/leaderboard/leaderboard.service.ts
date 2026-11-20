import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { computeCreditScore } from "../credit/credit.service.js";
import { fetchOnChainLeaderboard, fetchOnChainLeaderboardPosition } from "./onchain.service.js";
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
 * fetches from on-chain contract for ALL_TIME.
 *
 * Issue #933, #1617
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

  // ALL_TIME: fetch from on-chain contract.
  const skip = (page - 1) * limit;
  
  try {
    const onChainEntries = await fetchOnChainLeaderboard(limit * 2);
    const paginatedEntries = onChainEntries.slice(skip, skip + limit);

    const entries: LeaderboardEntry[] = await Promise.all(
      paginatedEntries.map(async (entry, index) => {
        const user = await prisma.user.findUnique({
          where: { stellarAddress: entry.address },
          select: { id: true, stellarAddress: true, username: true, displayName: true },
        });
        return {
          rank: skip + index + 1,
          userId: user?.id ?? "",
          stellarAddress: entry.address,
          username: user?.username ?? entry.username,
          displayName: user?.displayName ?? null,
          totalTipsStroops: entry.amount,
        };
      }),
    );

    return { entries, total: onChainEntries.length };
  } catch (error) {
    logger.error({ error, period }, 'Failed to fetch on-chain leaderboard, falling back to database');
    
    // Fallback to database aggregate if contract call fails.
    const grouped = await prisma.tip.groupBy({
      by: ["toAddress"],
      _sum: { amountStroops: true },
      orderBy: { _sum: { amountStroops: "desc" } },
      skip,
      take: limit,
    });

    const total = (await prisma.tip.groupBy({ by: ["toAddress"] })).length;

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
}

/**
 * Returns the on-chain leaderboard rank for a specific address.
 * Returns null if the address is not on the leaderboard.
 *
 * Issue #1616
 */
export async function getLeaderboardPosition(
  address: string,
): Promise<number | null> {
  logger.info({ address }, "Fetching leaderboard position");

  try {
    const rank = await fetchOnChainLeaderboardPosition(address);
    return rank;
  } catch (error) {
    logger.error({ error, address }, 'Failed to fetch on-chain position');
    return null;
  }
}
