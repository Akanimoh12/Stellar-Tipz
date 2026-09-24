import { chargeSubscriptionOnChain } from '../modules/subscriptions/subscriptions.service.js';
import { Worker, type ConnectionOptions } from 'bullmq';
import { redis } from '../db/redis.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../common/utils/logger.js';
import { SUBSCRIPTION_CHARGE_QUEUE, getSubscriptionChargeQueue } from './subscriptionCharge.queue.js';
import { scheduleRepeatable } from './scheduler.js';
import { attachDeadLetterHandler } from './deadLetter.js';

/**
 * Process due subscriptions: find all ACTIVE subscriptions whose
 * `nextChargeAt` <= now and submit a keeper transaction for each.
 * Confirmed on-chain events advance nextChargeAt through the indexer.
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
    include: { tipper: true, creator: true },
  });

  logger.info({ count: due.length }, 'Found due subscriptions');

  let processed = 0;
  let failed = 0;

  for (const sub of due) {
    try {
      // The contract owns billing periods and applies pending changes at next_due.
      // Only a confirmed sub_exec projection advances the database; a submitted
      // transaction is not a payment and must never create a synthetic Tip.
      await chargeSubscriptionOnChain(sub.tipper.stellarAddress, sub.creator.stellarAddress);

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

export function createSubscriptionChargeWorker(): Worker {
  const worker = new Worker(
    SUBSCRIPTION_CHARGE_QUEUE,
    async (_job) => {
      const result = await processDueSubscriptions();
      logger.info(result, 'Subscription charge job complete');
    },
    { connection: redis as unknown as ConnectionOptions },
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
    pattern: '*/5 * * * *', // Every 5 minutes
  });
}
