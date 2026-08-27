import { prisma } from '../../db/prisma.js';
import { config } from '../../config/index.js';
import { logger } from '../../common/utils/logger.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import { createNotification } from '../../modules/notifications/notifications.service.js';
import { submitScheduledWithdrawal } from './payoutSubmission.js';
import type { PayoutCadence } from '@prisma/client';

const MANUAL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 day between threshold re-checks

/** Advances nextRunAt after a successful payout, based on cadence. */
export function advanceScheduleAfterSuccess(
  cadence: PayoutCadence,
  from: Date,
): Date {
  const next = new Date(from);
  switch (cadence) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'MANUAL':
    default:
      next.setTime(next.getTime() + MANUAL_COOLDOWN_MS);
      break;
  }
  return next;
}

/** Exponential backoff for retries: base * 2^(failures-1). */
export function backoffNextRun(
  consecutiveFailures: number,
  from: Date,
  baseSeconds: number,
): Date {
  const factor = Math.pow(2, Math.max(0, consecutiveFailures - 1));
  return new Date(from.getTime() + baseSeconds * factor * 1000);
}

/** True when repeated failures have exhausted retries and the schedule pauses. */
export function shouldPauseAfterFailures(
  consecutiveFailures: number,
  maxAttempts: number,
): boolean {
  return consecutiveFailures >= maxAttempts;
}

export interface PayoutScheduleInput {
  enabled?: boolean;
  thresholdStroops?: string;
  cadence?: PayoutCadence;
}

/**
 * Returns the creator's payout schedule, or null if they have not configured one.
 */
export async function getPayoutSchedule(userId: string) {
  return prisma.payoutSchedule.findUnique({ where: { userId } });
}

/**
 * Creates or updates a creator's payout schedule (opt-in). When enabling, the
 * next run is scheduled immediately (subject to the periodic job) so the
 * configuration takes effect without a restart.
 */
export async function upsertPayoutSchedule(userId: string, input: PayoutScheduleInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  type SchedulePatch = {
    enabled?: boolean;
    thresholdStroops?: bigint;
    cadence?: PayoutCadence;
    paused?: boolean;
    consecutiveFailures?: number;
    nextRunAt?: Date;
  };

  const data: SchedulePatch = {};
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.thresholdStroops !== undefined) {
    data.thresholdStroops = BigInt(input.thresholdStroops);
  }
  if (input.cadence !== undefined) data.cadence = input.cadence;

  // Enabling from a paused/failed state clears the failure counters.
  if (input.enabled === true) {
    data.paused = false;
    data.consecutiveFailures = 0;
    data.nextRunAt = new Date();
  }

  const schedule = await prisma.payoutSchedule.upsert({
    where: { userId },
    create: {
      userId,
      enabled: data.enabled ?? false,
      thresholdStroops: data.thresholdStroops ?? BigInt(0),
      cadence: data.cadence ?? 'MANUAL',
      paused: false,
      consecutiveFailures: 0,
      nextRunAt: new Date(),
    },
    update: data,
  });

  return schedule;
}

/**
 * Lists schedules that are due for a payout attempt now: enabled, not paused,
 * and whose nextRunAt has passed. Excluded (deleted/deactivated/blocked/flagged)
 * creators are filtered out at the query level.
 */
export async function listEligiblePayouts(now = new Date()) {
  return prisma.payoutSchedule.findMany({
    where: {
      enabled: true,
      paused: false,
      nextRunAt: { lte: now },
      user: {
        deletedAt: null,
        deactivatedAt: null,
        blockedAt: null,
        flaggedUnverified: false,
      },
    },
    include: { user: { select: { id: true, stellarAddress: true } } },
  });
}

/** Computes the withdrawable balance (received minus already-withdrawn). */
export async function getWithdrawableBalance(stellarAddress: string): Promise<bigint> {
  const [received, withdrawn] = await Promise.all([
    prisma.tip.aggregate({
      where: { toAddress: stellarAddress, status: 'CONFIRMED' },
      _sum: { amountStroops: true },
    }),
    prisma.withdrawal.aggregate({
      where: { user: { stellarAddress }, status: { in: ['PENDING', 'CONFIRMED'] } },
      _sum: { amount: true },
    }),
  ]);
  const total = received._sum.amountStroops ?? BigInt(0);
  const taken = withdrawn._sum.amount ?? BigInt(0);
  return total > taken ? total - taken : BigInt(0);
}

export interface PayoutAttemptResult {
  userId: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  txHash?: string;
  netAmountStroops?: string;
  paused?: boolean;
  nextRunAt: Date;
  reason?: string;
}

/**
 * Attempts a single scheduled payout for the given schedule. Pure-ish: the only
 * side effects are the network submission (injectable) and the DB updates.
 * Records success/failure, advances nextRunAt, retries with backoff on failure,
 * and after exhausting attempts pauses the schedule and notifies the creator.
 */
export async function attemptPayout(
  schedule: {
    id: string;
    userId: string;
    thresholdStroops: bigint;
    cadence: PayoutCadence;
    consecutiveFailures: number;
    user: { id: string; stellarAddress: string };
  },
  now = new Date(),
  submit: typeof submitScheduledWithdrawal = submitScheduledWithdrawal,
): Promise<PayoutAttemptResult> {
  const balance = await getWithdrawableBalance(schedule.user.stellarAddress);
  const threshold = schedule.thresholdStroops;
  const min = config.payouts.minAmountStroops;

  if (balance < threshold || balance < min) {
    // Not enough yet. Re-check soon (cooldown) without counting as a failure.
    const nextRunAt = advanceScheduleAfterSuccess(schedule.cadence, now);
    await prisma.payoutSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt, lastRunAt: now, lastStatus: 'SKIPPED' },
    });
    return {
      userId: schedule.userId,
      status: 'SKIPPED',
      nextRunAt,
      reason: 'balance below threshold',
    };
  }

  try {
    const result = await submit(schedule.user.stellarAddress, balance);
    const nextRunAt = advanceScheduleAfterSuccess(schedule.cadence, now);
    await prisma.payoutSchedule.update({
      where: { id: schedule.id },
      data: {
        nextRunAt,
        lastRunAt: now,
        lastStatus: 'SUCCESS',
        consecutiveFailures: 0,
      },
    });
    return {
      userId: schedule.userId,
      status: 'SUCCESS',
      txHash: result.txHash,
      netAmountStroops: result.netAmountStroops,
      nextRunAt,
    };
  } catch (err) {
    const failures = schedule.consecutiveFailures + 1;
    const pause = shouldPauseAfterFailures(failures, config.payouts.maxAttempts);
    const nextRunAt = pause
      ? scheduleNextRunWhenPaused(now)
      : backoffNextRun(failures, now, config.payouts.backoffBaseSeconds);

    await prisma.payoutSchedule.update({
      where: { id: schedule.id },
      data: {
        nextRunAt,
        lastRunAt: now,
        lastStatus: 'FAILED',
        consecutiveFailures: failures,
        paused: pause,
      },
    });

    if (pause) {
      await createNotification(schedule.userId, 'payout_failed', {
        reason: err instanceof Error ? err.message : 'repeated payout failure',
        consecutiveFailures: failures,
      }).catch((nerr: unknown) =>
        logger.warn({ nerr, userId: schedule.userId }, 'Failed to notify payout failure'),
      );
    }

    return {
      userId: schedule.userId,
      status: 'FAILED',
      nextRunAt,
      paused: pause,
      reason: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

/** When paused we still set a nextRunAt far in the future to avoid busy-looping. */
function scheduleNextRunWhenPaused(now: Date): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + 30);
  return next;
}

/** Processes all schedules that are due right now. */
export async function processDuePayouts(
  now = new Date(),
  submit: typeof submitScheduledWithdrawal = submitScheduledWithdrawal,
): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
  const eligible = await listEligiblePayouts(now);
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const schedule of eligible) {
    try {
      const result = await attemptPayout(schedule, now, submit);
      if (result.status === 'SUCCESS') succeeded += 1;
      else if (result.status === 'FAILED') failed += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      logger.error({ err, scheduleId: schedule.id }, 'Payout attempt crashed');
    }
  }

  logger.info(
    { processed: eligible.length, succeeded, failed, skipped },
    'Scheduled payouts processed',
  );
  return { processed: eligible.length, succeeded, failed, skipped };
}
