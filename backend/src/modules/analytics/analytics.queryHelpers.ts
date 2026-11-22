import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';

/**
 * Shared building blocks for the analytics read queries: time bucketing,
 * date-range resolution and batched profile hydration.
 */

export type Granularity = 'day' | 'week' | 'month';

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * UTC time bucket label for a timestamp column: `YYYY-MM-DD` for day and week
 * (weeks start on Sunday) and `YYYY-MM` for month.
 */
export function bucketLabel(granularity: string, column = Prisma.sql`"createdAt"`): Prisma.Sql {
  switch (granularity as Granularity) {
    case 'week':
      return Prisma.sql`to_char(date_trunc('week', ${column} + interval '1 day') - interval '1 day', 'YYYY-MM-DD')`;
    case 'month':
      return Prisma.sql`to_char(date_trunc('month', ${column}), 'YYYY-MM')`;
    default:
      return Prisma.sql`to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`;
  }
}

export function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Half-open time ranges `[from, to)` not covered by a set of whole UTC days. */
export function uncoveredRanges(start: Date, endExclusive: Date, coveredDays: Set<number>): Array<[Date, Date]> {
  const ranges: Array<[Date, Date]> = [];
  let from: number | null = null;
  for (let cursor = start.getTime(); cursor < endExclusive.getTime(); ) {
    const dayStart = utcDayStart(new Date(cursor)).getTime();
    const next = Math.min(dayStart + DAY_MS, endExclusive.getTime());
    if (coveredDays.has(dayStart)) {
      if (from !== null) ranges.push([new Date(from), new Date(cursor)]);
      from = null;
    } else if (from === null) {
      from = cursor;
    }
    cursor = next;
  }
  if (from !== null) ranges.push([new Date(from), endExclusive]);
  return ranges;
}

/** Default analytics window when no start date is given: the last 30 days. */
export function resolveRange(startDate?: string, endDate?: string): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    end: endDate ? new Date(endDate) : now,
  };
}

export interface ProfileSummary {
  id: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
}

/** Loads the profiles for a set of addresses in a single query. */
export async function profilesByAddress(addresses: string[]): Promise<Map<string, ProfileSummary>> {
  if (addresses.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { stellarAddress: { in: addresses } },
    select: { id: true, stellarAddress: true, username: true, displayName: true },
  });
  return new Map(users.map((user) => [user.stellarAddress, user]));
}
