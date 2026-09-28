import { Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { processDuePayouts } from '../modules/withdrawals/payouts.service.js';
import { getPayoutQueue, PAYOUT_QUEUE } from './payout.queue.js';
import { scheduleRepeatable } from './scheduler.js';
import { attachDeadLetterHandler } from './deadLetter.js';

/**
 * Sweeps all due scheduled payouts. Eligible creators (enabled, not paused,
 * balance >= threshold) have their accrued balance withdrawn via the platform
 * payout keeper. Failures are retried with exponential backoff; after exhausting
 * attempts the schedule is paused and the creator is notified.
 */
export async function runPayoutSweep(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  return processDuePayouts();
}

export function createPayoutWorker(): Worker {
  const worker = new Worker(
    PAYOUT_QUEUE,
    async (_job) => {
      const result = await runPayoutSweep();
      logger.info(result, 'Payout sweep complete');
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Payout sweep job failed');
  });
  attachDeadLetterHandler(worker, PAYOUT_QUEUE);

  return worker;
}

export async function schedulePayouts(): Promise<void> {
  await scheduleRepeatable({
    queue: getPayoutQueue(),
    name: 'sweep',
    pattern: config.payouts.scheduleCron,
  });
}
