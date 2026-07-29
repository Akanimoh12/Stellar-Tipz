import { prisma } from '../../db/prisma.js';
import { BadRequestError } from '../../common/errors/AppError.js';
import type { StreakResponse } from './streaks.types.js';

/**
 * GET /streaks/me — the authenticated user's current tipping streak. Users
 * who have not yet tipped have no Streak row; this returns a zeroed streak
 * for them instead of a 404.
 */
export async function getMyStreak(userId: string): Promise<StreakResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new BadRequestError('User not found');

  const streak = await prisma.streak.findUnique({ where: { userId } });

  return {
    currentStreak: streak?.currentStreak ?? 0,
    longestStreak: streak?.longestStreak ?? 0,
    lastTipDate: streak?.lastTipDate ? streak.lastTipDate.toISOString() : null,
  };
}
