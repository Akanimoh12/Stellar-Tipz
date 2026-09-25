/**
 * Streak service - reads contract-authoritative streak data from projections.
 *
 * DESIGN DECISION (Issue #1270):
 * - Contract is authoritative source of truth for streak calculations
 * - Off-chain streaks.service.ts reads from database projections populated by indexer
 * - No duplicate computation logic - removed old getTodayUTC() based calculation
 * - Indexer listens to StreakMilestone events and updates Streak table
 * - API response indicates source (contract via indexer) and freshness
 *
 * This approach ensures single source of truth and prevents divergence.
 *
 * Issue #1270
 */

import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { NotFoundError } from "../../common/errors/AppError.js";
import type { StreakResponse } from "./streaks.types.js";

/**
 * Gets streak data for a user from database projections.
 * 
 * The streak data is populated by the indexer which listens to on-chain
 * StreakMilestone events. This ensures contract is the authoritative source.
 *
 * @param userId - User ID to fetch streak for
 * @returns Streak data with source and freshness information
 */
export async function getStreak(userId: string): Promise<StreakResponse> {
  logger.info({ userId }, "Fetching streak from projection");

  const streak = await prisma.streak.findUnique({
    where: { userId },
  });

  if (!streak) {
    // No streak data exists yet - return default
    return {
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastTipDate: null,
      source: "projection",
      freshness: new Date().toISOString(),
    };
  }

  return {
    userId: streak.userId,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastTipDate: streak.lastTipDate?.toISOString() ?? null,
    source: "projection", // Data comes from contract via indexer
    freshness: streak.updatedAt.toISOString(),
  };
}

/**
 * Gets streak data by stellar address.
 * 
 * First resolves the user ID from stellar address, then fetches streak data.
 */
export async function getStreakByAddress(
  stellarAddress: string,
): Promise<StreakResponse> {
  const user = await prisma.user.findUnique({
    where: { stellarAddress },
    select: { id: true },
  });

  if (!user) {
    throw new NotFoundError(`User with address ${stellarAddress} not found`);
  }

  return getStreak(user.id);
}

/**
 * Updates streak data in the projection (called by indexer).
 * 
 * This function is intended to be called by the indexer when it processes
 * StreakMilestone events from the contract. It ensures the off-chain projection
 * stays in sync with on-chain state.
 *
 * @param userId - User ID
 * @param currentStreak - Current streak count from contract
 * @param longestStreak - Longest streak count from contract
 * @param lastTipDate - Date of last tip from contract
 */
export async function updateStreakProjection(
  userId: string,
  currentStreak: number,
  longestStreak: number,
  lastTipDate: Date | null,
): Promise<void> {
  logger.info(
    { userId, currentStreak, longestStreak, lastTipDate },
    "Updating streak projection from contract event",
  );

  try {
    await prisma.streak.upsert({
      where: { userId },
      create: {
        userId,
        currentStreak,
        longestStreak,
        lastTipDate,
      },
      update: {
        currentStreak,
        longestStreak,
        lastTipDate,
      },
    });

    logger.info({ userId }, "Streak projection updated successfully");
  } catch (error) {
    logger.error({ userId, error }, "Failed to update streak projection");
    throw error;
  }
}

/**
 * Gets multiple streaks in batch (useful for leaderboards).
 */
export async function getStreaksBatch(
  userIds: string[],
): Promise<Map<string, StreakResponse>> {
  const streaks = await prisma.streak.findMany({
    where: { userId: { in: userIds } },
  });

  const result = new Map<string, StreakResponse>();

  // Initialize all users with default streaks
  for (const userId of userIds) {
    result.set(userId, {
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastTipDate: null,
      source: "projection",
      freshness: new Date().toISOString(),
    });
  }

  // Update with actual streak data
  for (const streak of streaks) {
    result.set(streak.userId, {
      userId: streak.userId,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastTipDate: streak.lastTipDate?.toISOString() ?? null,
      source: "projection",
      freshness: streak.updatedAt.toISOString(),
    });
  }

  return result;
}
