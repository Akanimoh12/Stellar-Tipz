import { prisma } from "../../db/prisma.js";
import { logger } from "./logger.js";

/**
 * Concurrency helpers for financial counters.
 *
 * Two patterns:
 *  1) Atomic increment/decrement — for counters that are pure sums (e.g. AnalyticsDaily.totalTips,
 *     Goal.raisedStroops). Uses Prisma's `increment`/`decrement` which translates to
 *     `SET field = field + $amount` in a single statement — no read-then-write, no lost update.
 *  2) Optimistic locking via `version` — for read-modify-write that is unavoidable
 *     (e.g. Streak currentStreak/longestStreak based on lastTipDate). The row is
 *     read, new values computed, then updated with `WHERE version = oldVersion`.
 *     On conflict (0 rows updated), the operation retries a bounded number of times.
 */

export const MAX_OPTIMISTIC_RETRIES = 3;

/**
 * Atomic increment of a Goal's raisedStroops.
 * Never does read-then-write; uses single-statement increment.
 * If the goal row does not exist yet, it is created with the amount as initial raised.
 */
export async function atomicIncrementGoalRaised(userId: string, amountStroops: bigint): Promise<void> {
  const gid = `goal_${userId}`;
  // Atomic increment via upsert — no lost update
  await prisma.goal.upsert({
    where: { id: gid },
    create: {
      id: gid,
      userId,
      title: "",
      targetStroops: BigInt(0),
      raisedStroops: amountStroops,
      status: "ACTIVE",
      version: 0,
    },
    update: {
      raisedStroops: { increment: amountStroops },
      version: { increment: 1 },
    },
  });
}

/**
 * Atomic increment of AnalyticsDaily counters.
 */
export async function atomicIncrementAnalyticsDaily(
  date: Date,
  increments: { totalTips?: number; totalVolume?: bigint; newUsers?: number; activeUsers?: number },
): Promise<void> {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  const data: Record<string, unknown> = {};
  const update: Record<string, unknown> = { version: { increment: 1 } };

  if (increments.totalTips) {
    // upsert create needs absolute, update needs increment
    (update as Record<string, unknown>).totalTips = { increment: increments.totalTips };
  }
  if (increments.totalVolume) {
    (update as Record<string, unknown>).totalVolume = { increment: increments.totalVolume };
  }
  if (increments.newUsers) {
    (update as Record<string, unknown>).newUsers = { increment: increments.newUsers };
  }
  if (increments.activeUsers) {
    (update as Record<string, unknown>).activeUsers = { increment: increments.activeUsers };
  }

  // Use upsert with atomic increment for update path
  await prisma.analyticsDaily.upsert({
    where: { date: day },
    create: {
      date: day,
      totalTips: increments.totalTips ?? 0,
      totalVolume: increments.totalVolume ?? BigInt(0),
      newUsers: increments.newUsers ?? 0,
      activeUsers: increments.activeUsers ?? 0,
    },
    update: update as never,
  });
}

/**
 * Optimistic-locking update for Streak.
 * Reads the streak, computes next values based on lastTipDate, then attempts
 * an update guarded by version. Retries on conflict.
 */
export async function updateStreakForTip(userId: string, now = new Date()): Promise<void> {
  let attempts = 0;
  const todayStr = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  while (attempts < MAX_OPTIMISTIC_RETRIES) {
    attempts++;
    // Read outside the guarded update (required for computation)
    let streak = await prisma.streak.findUnique({ where: { userId } });

    if (!streak) {
      try {
        await prisma.streak.create({
          data: {
            userId,
            currentStreak: 1,
            longestStreak: 1,
            lastTipDate: now,
            version: 0,
          },
        });
        return;
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === "P2002") {
          // Race: another transaction created it, retry
          continue;
        }
        throw err;
      }
    }

    const lastStr = streak.lastTipDate ? streak.lastTipDate.toISOString().slice(0, 10) : null;
    let newCurrent: number;
    let newLongest: number;

    if (lastStr === todayStr) {
      // Already tipped today — no streak change
      return;
    } else if (lastStr === yesterdayStr) {
      newCurrent = streak.currentStreak + 1;
    } else {
      newCurrent = 1;
    }
    newLongest = Math.max(streak.longestStreak, newCurrent);

    // Guarded update: only succeeds if version hasn't changed
    const res = await prisma.streak.updateMany({
      where: { userId, version: streak.version },
      data: {
        currentStreak: newCurrent,
        longestStreak: newLongest,
        lastTipDate: now,
        version: { increment: 1 },
      } as never,
    });

    if (res.count === 1) {
      return; // success
    }

    // Conflict: version changed, retry
    logger.warn({ userId, attempts }, "Streak version conflict, retrying");
  }

  throw new Error(`Streak update failed after ${MAX_OPTIMISTIC_RETRIES} retries due to version conflicts`);
}

/**
 * Generic optimistic retry helper for any version-guarded update.
 */
export async function withOptimisticRetry<T>(
  operation: () => Promise<{ updated: boolean }>,
  maxRetries = MAX_OPTIMISTIC_RETRIES,
): Promise<void> {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    const { updated } = await operation();
    if (updated) return;
    logger.warn({ attempts }, "Optimistic lock conflict, retrying");
  }
  throw new Error(`Optimistic update failed after ${maxRetries} retries`);
}
