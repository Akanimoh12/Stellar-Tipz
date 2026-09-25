import { Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { cacheSetJSON } from '../common/utils/cache.js';
import { computePlatformStats } from '../modules/stats/stats.service.js';
import { getPlatformStatsQueue, PLATFORM_STATS_QUEUE } from './platformStats.queue.js';
import { scheduleRepeatable } from './scheduler.js';
import { attachDeadLetterHandler } from './deadLetter.js';

const PLATFORM_STATS_CACHE_KEY = 'stats:platform';

/**
 * Recomputes platform stats and writes them to cache so the public endpoint
 * serves precomputed values instead of aggregating live on every request.
 * Failures are logged; the previously cached value (if any) remains served.
 */
export async function refreshPlatformStats(): Promise<void> {
  const stats = await computePlatformStats();
  await cacheSetJSON(PLATFORM_STATS_CACHE_KEY, stats, config.platformStats.cacheTtlSeconds);
  logger.info({ totalTips: stats.totalTips, creatorCount: stats.creatorCount }, 'Platform stats refreshed');
}

export function createPlatformStatsWorker(): Worker {
  const worker = new Worker(
    PLATFORM_STATS_QUEUE,
    async (_job) => {
      await refreshPlatformStats();
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Platform stats job failed');
  });
  attachDeadLetterHandler(worker, PLATFORM_STATS_QUEUE);

  return worker;
}

export async function schedulePlatformStats(): Promise<void> {
  await scheduleRepeatable({
    queue: getPlatformStatsQueue(),
    name: 'refresh',
    pattern: config.platformStats.scheduleCron,
  });
}
