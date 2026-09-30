import { Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import {
  computeDailyAnalytics,
  refreshTipperRollup,
} from '../modules/analytics/analytics.service.js';
import { ANALYTICS_DAILY_QUEUE, getAnalyticsDailyQueue } from './analyticsDaily.queue.js';
import { scheduleRepeatable } from './scheduler.js';
import { attachDeadLetterHandler } from './deadLetter.js';

export async function runDailyAnalyticsRollup(
  date?: string,
): Promise<{ date: string; totalTips: number; totalVolume: string }> {
  // Scheduled runs compute yesterday; manual operator runs may target a specific UTC date.
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = date ?? yesterday.toISOString().slice(0, 10);

  const result = await computeDailyAnalytics(dateStr);
  return { date: result.date, totalTips: result.totalTips, totalVolume: result.totalVolume };
}

/** Job name for rebuilding the ranked top-tippers rollup (issue #1265). */
export const TIPPER_ROLLUP_JOB = 'tipper-rollup';

export function createAnalyticsDailyWorker(): Worker {
  const worker = new Worker(
    ANALYTICS_DAILY_QUEUE,
    async (job) => {
      if (job.name === TIPPER_ROLLUP_JOB) {
        await refreshTipperRollup();
        return;
      }
      const result = await runDailyAnalyticsRollup(
        (job.data as { date?: string } | undefined)?.date,
      );
      logger.info(result, 'Daily analytics rollup complete');
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Daily analytics rollup job failed');
  });
  attachDeadLetterHandler(worker, ANALYTICS_DAILY_QUEUE);

  return worker;
}

export async function scheduleAnalyticsDaily(): Promise<void> {
  await scheduleRepeatable({
    queue: getAnalyticsDailyQueue(),
    name: 'rollup',
    pattern: config.analytics.dailyCron,
  });
  await scheduleRepeatable({
    queue: getAnalyticsDailyQueue(),
    name: TIPPER_ROLLUP_JOB,
    pattern: config.analytics.tipperRollupCron,
  });
}
