import { Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { computeDailyAnalytics } from '../modules/analytics/analytics.service.js';
import { ANALYTICS_DAILY_QUEUE, getAnalyticsDailyQueue } from './analyticsDaily.queue.js';
import { scheduleRepeatable } from './scheduler.js';

export async function runDailyAnalyticsRollup(): Promise<{ date: string; totalTips: number; totalVolume: string }> {
  // Compute for yesterday in UTC so the job can run anytime after midnight
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  const result = await computeDailyAnalytics(dateStr);
  return { date: result.date, totalTips: result.totalTips, totalVolume: result.totalVolume };
}

export function createAnalyticsDailyWorker(): Worker {
  const worker = new Worker(
    ANALYTICS_DAILY_QUEUE,
    async (_job) => {
      const result = await runDailyAnalyticsRollup();
      logger.info(result, 'Daily analytics rollup complete');
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Daily analytics rollup job failed');
  });

  return worker;
}

export async function scheduleAnalyticsDaily(): Promise<void> {
  await scheduleRepeatable({
    queue: getAnalyticsDailyQueue(),
    name: 'rollup',
    pattern: config.analytics.dailyCron,
  });
}
