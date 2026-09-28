/**
 * #1264 — Analytics Daily Rollup Worker
 *
 * Populates `AnalyticsDaily` table on a scheduled cadence (e.g. 5 0 * * * UTC cron).
 *
 * ## UTC Day Boundaries Specification:
 * - All analytics rollups operate strictly in the Coordinated Universal Time (UTC) timezone.
 * - A single day starts at exactly `00:00:00.000Z` (inclusive) and ends at `23:59:59.999Z` (inclusive).
 * - The date key stored in `AnalyticsDaily.date` is the UTC midnight timestamp (`YYYY-MM-DDT00:00:00.000Z`).
 * - Rollup computation is completely idempotent: multiple executions with identical underlying data
 *   yield identical `AnalyticsDaily` records via database `upsert`.
 * - Late-arriving events (from indexer or network lag) trigger automated retroactive recomputations
 *   of the affected historical UTC days.
 * - Missing day gaps are detected and backfilled automatically.
 */

import { prisma as defaultPrisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';

export interface DayBoundaries {
  /** UTC start of day: YYYY-MM-DDT00:00:00.000Z */
  startUtc: Date;
  /** UTC end of day: YYYY-MM-DDT23:59:59.999Z */
  endUtc: Date;
  /** Normalized UTC midnight date used as primary key */
  midnightUtc: Date;
  /** ISO Date string formatted YYYY-MM-DD */
  isoDateString: string;
}

export interface RollupSummary {
  date: Date;
  isoDateString: string;
  totalTips: number;
  totalStroops: bigint;
  uniqueTippers: number;
  uniqueCreators: number;
  activeUsers: number;
}

/**
 * Calculates exact UTC day boundaries for any given timestamp or ISO string.
 *
 * Guarantees:
 * - `startUtc` millisecond is always 0.
 * - `endUtc` millisecond is always 999.
 * - Timezone offsets in local system environments do NOT affect calculation.
 */
export function getUtcDayBoundaries(input: Date | string | number): DayBoundaries {
  const d = new Date(input);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date supplied to getUtcDayBoundaries: ${input}`);
  }

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  const startUtc = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
  const midnightUtc = new Date(startUtc.getTime());

  const monthStr = String(month + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const isoDateString = `${year}-${monthStr}-${dayStr}`;

  return {
    startUtc,
    endUtc,
    midnightUtc,
    isoDateString,
  };
}

/**
 * Computes daily metrics for the specified UTC day and writes to `AnalyticsDaily` via idempotent upsert.
 */
export async function computeDailyRollup(
  targetDate: Date | string | number,
  prisma = defaultPrisma,
): Promise<RollupSummary> {
  const { startUtc, endUtc, midnightUtc, isoDateString } = getUtcDayBoundaries(targetDate);

  logger.info({ startUtc, endUtc, isoDateString }, 'Computing daily analytics rollup');

  // Query all non-failed tips within the exact UTC boundary [startUtc, endUtc]
  const tips = await prisma.tip.findMany({
    where: {
      createdAt: {
        gte: startUtc,
        lte: endUtc,
      },
      status: {
        not: 'FAILED',
      },
    },
    select: {
      amountStroops: true,
      fromAddress: true,
      toAddress: true,
      senderId: true,
      recipientId: true,
    },
  });

  const totalTips = tips.length;
  let totalStroops = BigInt(0);
  const tippers = new Set<string>();
  const creators = new Set<string>();
  const allUsers = new Set<string>();

  for (const tip of tips) {
    totalStroops += BigInt(tip.amountStroops);

    const tipper = tip.senderId ?? tip.fromAddress;
    if (tipper) {
      tippers.add(tipper);
      allUsers.add(tipper);
    }

    const creator = tip.recipientId ?? tip.toAddress;
    if (creator) {
      creators.add(creator);
      allUsers.add(creator);
    }
  }

  const summary: RollupSummary = {
    date: midnightUtc,
    isoDateString,
    totalTips,
    totalStroops,
    uniqueTippers: tippers.size,
    uniqueCreators: creators.size,
    activeUsers: allUsers.size,
  };

  // Idempotent upsert by unique date
  await prisma.analyticsDaily.upsert({
    where: { date: midnightUtc },
    create: {
      date: midnightUtc,
      totalTips: summary.totalTips,
      totalStroops: summary.totalStroops,
      uniqueTippers: summary.uniqueTippers,
      uniqueCreators: summary.uniqueCreators,
      activeUsers: summary.activeUsers,
    },
    update: {
      totalTips: summary.totalTips,
      totalStroops: summary.totalStroops,
      uniqueTippers: summary.uniqueTippers,
      uniqueCreators: summary.uniqueCreators,
      activeUsers: summary.activeUsers,
    },
  });

  logger.info({ summary }, 'Analytics daily rollup persisted successfully');
  return summary;
}

/**
 * Detects late-arriving events and recomputes rollups for all affected historical UTC days.
 */
export async function recomputeDaysForLateData(
  eventTimestamps: (Date | string | number)[],
  prisma = defaultPrisma,
): Promise<RollupSummary[]> {
  if (!eventTimestamps.length) return [];

  // Group unique UTC calendar days
  const uniqueDatesMap = new Map<string, Date>();
  for (const ts of eventTimestamps) {
    const { midnightUtc, isoDateString } = getUtcDayBoundaries(ts);
    if (!uniqueDatesMap.has(isoDateString)) {
      uniqueDatesMap.set(isoDateString, midnightUtc);
    }
  }

  const results: RollupSummary[] = [];
  for (const [, date] of uniqueDatesMap) {
    const summary = await computeDailyRollup(date, prisma);
    results.push(summary);
  }

  logger.info({ affectedDays: results.length }, 'Recomputed rollups for late-arriving data');
  return results;
}

/**
 * Scans a date range, identifies any missing days in `AnalyticsDaily`, and backfills them.
 */
export async function detectAndBackfillMissingDays(
  startDate: Date | string | number,
  endDate: Date | string | number,
  prisma = defaultPrisma,
): Promise<{ backfilledDays: string[]; summaries: RollupSummary[] }> {
  const start = getUtcDayBoundaries(startDate).midnightUtc;
  const end = getUtcDayBoundaries(endDate).midnightUtc;

  if (start.getTime() > end.getTime()) {
    throw new Error('startDate must be before or equal to endDate');
  }

  // Fetch all existing daily rollup records in the range
  const existingRecords = await prisma.analyticsDaily.findMany({
    where: {
      date: {
        gte: start,
        lte: end,
      },
    },
    select: { date: true },
  });

  const existingDates = new Set(
    existingRecords.map((r) => getUtcDayBoundaries(r.date).isoDateString),
  );

  const backfilledDays: string[] = [];
  const summaries: RollupSummary[] = [];

  const current = new Date(start.getTime());
  while (current.getTime() <= end.getTime()) {
    const { isoDateString, midnightUtc } = getUtcDayBoundaries(current);

    if (!existingDates.has(isoDateString)) {
      logger.info({ isoDateString }, 'Detected missing analytics day, backfilling...');
      const summary = await computeDailyRollup(midnightUtc, prisma);
      backfilledDays.push(isoDateString);
      summaries.push(summary);
    }

    // Step forward 1 UTC day (24 hours)
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return { backfilledDays, summaries };
}

/**
 * Standard cron job runner for `5 0 * * *` (00:05 UTC every day).
 * Computes the rollup for the previous UTC day.
 */
export async function runCronDailyRollup(
  now = new Date(),
  prisma = defaultPrisma,
): Promise<RollupSummary> {
  const yesterday = new Date(now.getTime());
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return computeDailyRollup(yesterday, prisma);
}
