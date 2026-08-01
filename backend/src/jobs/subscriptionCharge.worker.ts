import { Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../common/utils/logger.js';
import { SUBSCRIPTION_CHARGE_QUEUE, getSubscriptionChargeQueue } from './subscriptionCharge.queue.js';
import { scheduleRepeatable } from './scheduler.js';

/**
 * Process due subscriptions: find all ACTIVE subscriptions whose
 * `nextChargeAt` <= now, create a Tip for each, and advance the
 * nextChargeAt timestamp by the subscription interval.
 *
 * Idempotent — safe to run multiple times for the same window.
 */
export async function processDueSubscriptions(): Promise<{ processed: number; failed: number }> {
  const now = new Date();

  const due = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      nextChargeAt: { lte: now },
      deletedAt: null,
    },
  });

  logger.info({ count: due.length }, 'Found due subscriptions');

  let processed = 0;
  let failed = 0;

  for (const sub of due) {
    try {
      await prisma.$transaction(async (tx) => {
        // Create a Tip for this subscription charge
        await tx.tip.create({
          data: {
            fromAddress: sub.tipperId,
            toAddress: sub.creatorId,
            amountStroops: sub.amountStroops,
            status: 'CONFIRMED',
            memo: `Subscription charge: ${sub.id}`,
          },
        });

        // Advance nextChargeAt based on interval
        const next = computeNextChargeAt(sub.nextChargeAt, sub.interval);
        await tx.subscription.update({
          where: { id: sub.id },
          data: { nextChargeAt: next },
        });
      });

      processed += 1;
      logger.info({ subscriptionId: sub.id }, 'Subscription charged');
    } catch (err) {
      failed += 1;
      logger.error(
        { err, subscriptionId: sub.id },
        'Failed to charge subscription',
      );
    }
  }

  logger.info({ processed, failed }, 'Subscription charge run complete');
  return { processed, failed };
}

function computeNextChargeAt(current: Date, interval: string): Date {
  const next = new Date(current);
  switch (interval) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }
  return next;
}

export function createSubscriptionChargeWorker(): Worker {
  const worker = new Worker(
    SUBSCRIPTION_CHARGE_QUEUE,
    async (_job) => {
      const result = await processDueSubscriptions();
      logger.info(result, 'Subscription charge job complete');
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Subscription charge job failed');
  });

  return worker;
}

export async function scheduleSubscriptionCharge(): Promise<void> {
  await scheduleRepeatable({
    queue: getSubscriptionChargeQueue(),
    name: 'charge',
    pattern: '*/5 * * * *', // Every 5 minutes
  });
}
