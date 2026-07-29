import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import type { StreakResponse, StreakUpdateResult } from './streaks.types.js';

function serializeStreak(row: {
  id: string;
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastTipDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): StreakResponse {
  return {
    id: row.id,
    userId: row.userId,
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastTipDate: row.lastTipDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getMyStreak(userId: string): Promise<StreakResponse> {
  const row = await prisma.streak.findUnique({ where: { userId } });
  if (!row) {
    return {
      id: '',
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastTipDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  return serializeStreak(row);
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
  }

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
    where: { userId: tipperId },
    data: {
      currentStreak: newCurrent,
      longestStreak: newLongest,
      lastTipDate: today,
    },
  });

  logger.info(
    { userId: tipperId, currentStreak: newCurrent, longestStreak: newLongest },
    'Streak updated',
  );

  return { currentStreak: newCurrent, longestStreak: newLongest, streakUpdated: true };
}
