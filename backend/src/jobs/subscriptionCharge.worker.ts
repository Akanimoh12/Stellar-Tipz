import { Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../common/utils/logger.js';
import { config } from '../config/index.js';
import { createSystemNotification } from '../modules/notifications/notifications.service.js';
import { chargeSubscriptionOnChain } from '../modules/subscriptions/subscriptions.service.js';
import type { SubscriptionIntervalName } from '../modules/subscriptions/subscriptions.types.js';
import {
  SUBSCRIPTION_CHARGE_QUEUE,
  getSubscriptionChargeQueue,
} from './subscriptionCharge.queue.js';
import { scheduleRepeatable } from './scheduler.js';
import { attachDeadLetterHandler } from './deadLetter.js';
import {
  classifySubscriptionChargeFailure,
  type SubscriptionChargeFailure,
} from './subscriptionCharge.failure.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DUNNING_RETRY_DAYS = [1, 3, 7] as const;
const CHARGE_CLAIM_TTL_MS = 15 * 60 * 1000;

type ChargeExecutor = (subscriberAddress: string, creatorAddress: string) => Promise<void>

interface DueSubscription {
  id: string
  tipperId: string
  creatorId: string
  interval: SubscriptionIntervalName
  nextChargeAt: Date
  status: 'ACTIVE' | 'PAST_DUE'
  chargeFailureCount: number
  dunningStartedAt: Date | null
  nextChargeRetryAt: Date | null
  chargeAttemptStartedAt: Date | null
  tipper: { stellarAddress: string }
  creator: { stellarAddress: string }
}

export interface ProcessDueSubscriptionsOptions {
  now?: Date
  charge?: ChargeExecutor
}

/** Returns the retry time anchored to dunning start, or null after retry day 7. */
export function getNextDunningRetryAt(startedAt: Date, failureCount: number): Date | null {
  const retryDay = DUNNING_RETRY_DAYS[failureCount - 1];
  return retryDay === undefined ? null : new Date(startedAt.getTime() + retryDay * DAY_MS);
}

/** Advances the regular billing anchor by exactly one contract interval. */
export function computeNextChargeAt(current: Date, interval: SubscriptionIntervalName): Date {
  const intervalDays: Record<SubscriptionIntervalName, number> = {
    DAILY: 1,
    WEEKLY: 7,
    MONTHLY: 30,
  };
  return new Date(current.getTime() + intervalDays[interval] * DAY_MS);
}

async function notifyFailure(
  sub: DueSubscription,
  failure: SubscriptionChargeFailure,
  failureCount: number,
  nextRetryAt: Date | null,
  terminal: boolean,
): Promise<void> {
  const payload = {
    subscriptionId: sub.id,
    reason: failure.reason,
    failureCode: failure.code,
    failureCount,
    nextRetryAt: nextRetryAt?.toISOString() ?? null,
    terminal,
  };

  await createSystemNotification(sub.tipperId, 'subscription_charge_failed', payload).catch(
    (err: unknown) => {
      logger.warn(
        { err, subscriptionId: sub.id, userId: sub.tipperId },
        'Failed to notify subscriber of subscription charge failure',
      );
    },
  );

  if (terminal) {
    await createSystemNotification(sub.creatorId, 'subscription_failed', payload).catch(
      (err: unknown) => {
        logger.warn(
          { err, subscriptionId: sub.id, userId: sub.creatorId },
          'Failed to notify creator of terminal subscription failure',
        );
      },
    );
  }
}

async function claimSubscription(sub: DueSubscription, now: Date): Promise<boolean> {
  const duePredicate =
    sub.status === 'ACTIVE'
      ? { nextChargeAt: sub.nextChargeAt }
      : { nextChargeRetryAt: sub.nextChargeRetryAt };
  const result = await prisma.subscription.updateMany({
    where: {
      id: sub.id,
      status: sub.status,
      chargeFailureCount: sub.chargeFailureCount,
      chargeAttemptStartedAt: sub.chargeAttemptStartedAt,
      ...duePredicate,
    },
    data: { chargeAttemptStartedAt: now },
  });
  return result.count === 1;
}

async function persistSuccess(sub: DueSubscription, now: Date): Promise<boolean> {
  const result = await prisma.subscription.updateMany({
    where: {
      id: sub.id,
      status: sub.status,
      chargeAttemptStartedAt: now,
    },
    data: {
      status: 'ACTIVE',
      nextChargeAt: computeNextChargeAt(sub.nextChargeAt, sub.interval),
      chargeFailureCount: 0,
      dunningStartedAt: null,
      nextChargeRetryAt: null,
      lastChargeFailureReason: null,
      chargeAttemptStartedAt: null,
    },
  });
  return result.count === 1;
}

async function persistFailure(
  sub: DueSubscription,
  now: Date,
  failure: SubscriptionChargeFailure,
): Promise<{
  persisted: boolean
  failureCount: number
  nextRetryAt: Date | null
  terminal: boolean
}> {
  const failureCount = sub.chargeFailureCount + 1;
  const dunningStartedAt = sub.dunningStartedAt ?? now;
  const nextRetryAt = failure.retryable
    ? getNextDunningRetryAt(dunningStartedAt, failureCount)
    : null;
  const terminal = !failure.retryable || nextRetryAt === null;
  const result = await prisma.subscription.updateMany({
    where: {
      id: sub.id,
      status: sub.status,
      chargeAttemptStartedAt: now,
    },
    data: {
      status: terminal ? 'FAILED' : 'PAST_DUE',
      chargeFailureCount: failureCount,
      dunningStartedAt,
      nextChargeRetryAt: nextRetryAt,
      lastChargeFailureReason: failure.reason,
      chargeAttemptStartedAt: null,
    },
  });
  return { persisted: result.count === 1, failureCount, nextRetryAt, terminal };
}

/**
 * Attempts each actionable subscription once. Multi-day retries are discovered
 * from persisted dunning state; BullMQ retry attempts are not used for dunning.
 */
export async function processDueSubscriptions(
  options: ProcessDueSubscriptionsOptions = {},
): Promise<{ processed: number; failed: number }> {
  const now = options.now ?? new Date();
  const charge = options.charge ?? chargeSubscriptionOnChain;
  const staleClaimBefore = new Date(now.getTime() - CHARGE_CLAIM_TTL_MS);

  const due = await prisma.subscription.findMany({
    where: {
      deletedAt: null,
      AND: [
        {
          OR: [
            { status: 'ACTIVE', nextChargeAt: { lte: now } },
            { status: 'PAST_DUE', nextChargeRetryAt: { lte: now } },
          ],
        },
        {
          OR: [
            { chargeAttemptStartedAt: null },
            { chargeAttemptStartedAt: { lte: staleClaimBefore } },
          ],
        },
      ],
    },
    include: {
      tipper: { select: { stellarAddress: true } },
      creator: { select: { stellarAddress: true } },
    },
  } as never);

  logger.info({ count: due.length }, 'Found due subscriptions');
  let processed = 0;
  let failed = 0;

  for (const sub of due as unknown as DueSubscription[]) {
    try {
      if (!(await claimSubscription(sub, now))) {
        logger.info({ subscriptionId: sub.id }, 'Subscription charge already claimed');
        continue;
      }

      try {
        await charge(sub.tipper.stellarAddress, sub.creator.stellarAddress);
      } catch (err) {
        failed += 1;
        const failure = classifySubscriptionChargeFailure(err);
        const outcome = await persistFailure(sub, now, failure);

        if (outcome.persisted) {
          await notifyFailure(
            sub,
            failure,
            outcome.failureCount,
            outcome.nextRetryAt,
            outcome.terminal,
          );
        } else {
          logger.warn(
            { subscriptionId: sub.id },
            'Subscription changed while its failed charge was in progress',
          );
        }

        logger.error(
          { err, subscriptionId: sub.id, failureCode: failure.code, retryable: failure.retryable },
          'Failed to charge subscription',
        );
        continue;
      }

      if (await persistSuccess(sub, now)) {
        processed += 1;
        logger.info({ subscriptionId: sub.id }, 'Subscription charge submitted');
      } else {
        logger.warn(
          { subscriptionId: sub.id },
          'Subscription changed while its charge was in progress',
        );
      }
    } catch (err) {
      failed += 1;
      logger.error({ err, subscriptionId: sub.id }, 'Failed to persist subscription charge state');
    }
  }

  logger.info({ processed, failed }, 'Subscription charge run complete');
  return { processed, failed };
}

export function createSubscriptionChargeWorker(): Worker {
  const worker = new Worker(
    SUBSCRIPTION_CHARGE_QUEUE,
    async (_job) => {
      const result = await processDueSubscriptions();
      logger.info(result, 'Subscription charge job complete');
    },
    { connection: redis as never },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Subscription charge job failed');
  });
  attachDeadLetterHandler(worker, SUBSCRIPTION_CHARGE_QUEUE);
  return worker;
}

export async function scheduleSubscriptionCharge(): Promise<void> {
  await scheduleRepeatable({
    queue: getSubscriptionChargeQueue(),
    name: 'charge',
    pattern: config.subscriptions.chargeCron,
  });
}
