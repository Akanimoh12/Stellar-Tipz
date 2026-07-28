import { Worker } from 'bullmq';
import { prisma } from '../db/prisma.js';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import {
  chargeSubscriptionOnChain,
  INTERVAL_DAYS,
} from '../modules/subscriptions/subscriptions.service.js';
import type { SubscriptionIntervalName } from '../modules/subscriptions/subscriptions.types.js';
import { SUBSCRIPTION_CHARGE_QUEUE, getSubscriptionChargeQueue } from './subscriptionCharge.queue.js';
import { scheduleRepeatable } from './scheduler.js';

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Finds every ACTIVE subscription whose `nextChargeAt` has passed and charges
 * it on-chain via the keeper-callable `execute_due_subscription` contract
 * function (#1029). Advances `nextChargeAt` locally on success so the same
 * subscription isn't picked up again before the indexer's own `sub_exec`
 * projection catches up; a per-subscription failure doesn't stop the run.
 */
export async function processDueSubscriptions(): Promise<{ processed: number; failed: number }> {
  const due = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', nextChargeAt: { lte: new Date() }, deletedAt: null },
    include: { tipper: true, creator: true },
  });

  let processed = 0;
  let failed = 0;

  for (const subscription of due) {
    try {
      await chargeSubscriptionOnChain(subscription.tipper.stellarAddress, subscription.creator.stellarAddress);
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          nextChargeAt: addDays(
            new Date(),
            INTERVAL_DAYS[subscription.interval as SubscriptionIntervalName],
          ),
        },
      });
      processed++;
    } catch (err) {
      logger.error({ err, subscriptionId: subscription.id }, 'Failed to process subscription charge');
      failed++;
    }
  }

  return { processed, failed };
}

export function createSubscriptionChargeWorker(): Worker {
  const worker = new Worker(
    SUBSCRIPTION_CHARGE_QUEUE,
    async (_job) => {
      const result = await processDueSubscriptions();
      logger.info(result, 'Subscription charge processing complete');
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
    name: 'process-due',
    pattern: config.subscriptions.chargeCron,
  });
}
