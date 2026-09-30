import { Worker } from 'bullmq';
import { prisma } from '../db/prisma.js';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { fetchXMetrics } from '../modules/x/x.service.js';
import { X_METRICS_REFRESH_QUEUE, getXMetricsRefreshQueue } from './xMetricsRefresh.queue.js';
import { scheduleRepeatable } from './scheduler.js';
import { attachDeadLetterHandler } from './deadLetter.js';

/**
 * Refreshes cached X (Twitter) metrics for every known account. Idempotent —
 * each handle's cached row is fully replaced by `fetchXMetrics`. One handle
 * failing (e.g. rate-limited or no longer found) never blocks the others.
 */
export async function refreshAllXMetrics(): Promise<{ processed: number; failed: number }> {
  const accounts = await prisma.xAccount.findMany({
    select: { handle: true },
  });

  let processed = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      await fetchXMetrics(account.handle, { useFallback: false });
      processed++;
    } catch (err) {
      logger.error({ err, handle: account.handle }, 'Failed to refresh X metrics');
      failed++;
    }
  }

  logger.info({ processed, failed }, 'X metrics refresh run complete');
  return { processed, failed };
}

export function createXMetricsRefreshWorker(): Worker {
  const worker = new Worker(
    X_METRICS_REFRESH_QUEUE,
    async (_job) => {
      const result = await refreshAllXMetrics();
      logger.info(result, 'X metrics refresh job complete');
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'X metrics refresh job failed');
  });
  attachDeadLetterHandler(worker, X_METRICS_REFRESH_QUEUE);

  return worker;
}

export async function scheduleXMetricsRefresh(): Promise<void> {
  await scheduleRepeatable({
    queue: getXMetricsRefreshQueue(),
    name: 'refresh',
    pattern: config.twitter.metricsRefreshCron,
  });
}
