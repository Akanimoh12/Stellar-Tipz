import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { BadRequestError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import type { StreakResponse, StreakUpdateResult } from './streaks.types.js';

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

function getTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isYesterday(d: Date): boolean {
  const today = getTodayUTC();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return dUTC.getTime() === yesterday.getTime();
}

function isToday(d: Date): boolean {
  const today = getTodayUTC();
  const dUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return dUTC.getTime() === today.getTime();
}

export async function updateStreakOnTip(tipperId: string): Promise<StreakUpdateResult> {
  const today = getTodayUTC();

  const existing = await prisma.streak.findUnique({ where: { userId: tipperId } });

  if (!existing) {
    try {
      await prisma.streak.create({
        data: {
          userId: tipperId,
          currentStreak: 1,
          longestStreak: 1,
          lastTipDate: today,
        },
      });
      logger.info({ userId: tipperId }, 'Streak started at 1');
      return { currentStreak: 1, longestStreak: 1, streakUpdated: true };
    } catch (err) {
      // P2002 means another concurrent request created the streak first
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Fetch the newly created streak and proceed with update logic
        const newStreak = await prisma.streak.findUnique({ where: { userId: tipperId } });
        if (!newStreak) {
          throw new Error('Failed to create or find streak after P2002 error');
        }
        // Fall through to the update logic below with the existing streak
        // (we'll set existing to newStreak and continue)
        return updateExistingStreak(newStreak, today);
      }
      throw err;
    }
  }

  return updateExistingStreak(existing, today);
}

/**
 * Helper function to update an existing streak based on the last tip date.
 */
async function updateExistingStreak(
  existing: { currentStreak: number; longestStreak: number; lastTipDate: Date | null; userId: string },
  today: Date,
): Promise<StreakUpdateResult> {
  if (existing.lastTipDate && isToday(existing.lastTipDate)) {
    return {
      currentStreak: existing.currentStreak,
      longestStreak: existing.longestStreak,
      streakUpdated: false,
    };
  }

  let newCurrent: number;
  if (existing.lastTipDate && isYesterday(existing.lastTipDate)) {
    newCurrent = existing.currentStreak + 1;
  } else {
    newCurrent = 1;
  }

  const newLongest = Math.max(newCurrent, existing.longestStreak);

  await prisma.streak.update({
    where: { userId: existing.userId },
    data: {
      currentStreak: newCurrent,
      longestStreak: newLongest,
      lastTipDate: today,
    },
  });

  logger.info(
    { userId: existing.userId, currentStreak: newCurrent, longestStreak: newLongest },
    'Streak updated',
  );

  return { currentStreak: newCurrent, longestStreak: newLongest, streakUpdated: true };
}
