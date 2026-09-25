import { Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { cacheSetJSON } from '../common/utils/cache.js';
import { computeTrending, computeSimilar, similarCacheKey } from '../modules/discovery/discovery.service.js';
import { getDiscoveryQueue, DISCOVERY_QUEUE } from './discovery.queue.js';
import { scheduleRepeatable } from './scheduler.js';
import { attachDeadLetterHandler } from './deadLetter.js';

/**
 * Recomputes the trending ranking and warms the per-creator "similar" cache for
 * the current top creators. Results are written to Redis and served from cache
 * by the discovery endpoints, so request handlers never aggregate live.
 */
export async function refreshDiscoveryCache(): Promise<{ trending: number; similar: number }> {
  const trending = await computeTrending();
  await cacheSetJSON('discovery:trending', trending, config.discovery.cacheTtlSeconds);

  let similar = 0;
  for (const creator of trending.data.slice(0, 20)) {
    if (!creator.username) continue;
    try {
      const similarResult = await computeSimilar(creator.username);
      await cacheSetJSON(
        similarCacheKey(creator.username),
        similarResult,
        config.discovery.cacheTtlSeconds,
      );
      similar += 1;
    } catch (err) {
      logger.warn({ err, username: creator.username }, 'Failed to warm similar cache');
    }
  }

  logger.info({ trending: trending.data.length, similar }, 'Discovery cache refreshed');
  return { trending: trending.data.length, similar };
}

export function createDiscoveryWorker(): Worker {
  const worker = new Worker(
    DISCOVERY_QUEUE,
    async (_job) => {
      const result = await refreshDiscoveryCache();
      logger.info(result, 'Discovery job complete');
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Discovery job failed');
  });
  attachDeadLetterHandler(worker, DISCOVERY_QUEUE);

  return worker;
}

export async function scheduleDiscovery(): Promise<void> {
  await scheduleRepeatable({
    queue: getDiscoveryQueue(),
    name: 'refresh',
    pattern: config.discovery.scheduleCron,
  });
}
