import { Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { createLeaderboardSnapshot } from '../modules/leaderboard/leaderboard.service.js';
import type { SnapshotPeriod } from '../modules/leaderboard/leaderboard.schema.js';
import {
  LEADERBOARD_SNAPSHOT_QUEUE,
  getLeaderboardSnapshotQueue,
} from './leaderboardSnapshot.queue.js';
import { scheduleRepeatable } from './scheduler.js';
import { attachDeadLetterHandler } from './deadLetter.js';

const SNAPSHOT_PERIODS: SnapshotPeriod[] = ['WEEKLY', 'MONTHLY', 'ALL_TIME'];

/**
 * Rebuilds the leaderboard snapshot for every period. Idempotent — each
 * period's snapshot is fully replaced (delete + recreate in a single
 * transaction) by `createLeaderboardSnapshot`, so re-running for the same
 * window always converges to the same stored ranking. One period failing
 * never blocks the others.
 */
export async function runLeaderboardSnapshot(): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (const period of SNAPSHOT_PERIODS) {
    try {
      const result = await createLeaderboardSnapshot(period);
      processed += 1;
      logger.info(result, 'Leaderboard snapshot period complete');
    } catch (err) {
      failed += 1;
      logger.error({ err, period }, 'Failed to snapshot leaderboard period');
    }
  }

  logger.info({ processed, failed }, 'Leaderboard snapshot run complete');
  return { processed, failed };
}

export function createLeaderboardSnapshotWorker(): Worker {
  const worker = new Worker(
    LEADERBOARD_SNAPSHOT_QUEUE,
    async (_job) => {
      const result = await runLeaderboardSnapshot();
      logger.info(result, 'Leaderboard snapshot job complete');
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Leaderboard snapshot job failed');
  });
  attachDeadLetterHandler(worker, LEADERBOARD_SNAPSHOT_QUEUE);

  return worker;
}

export async function scheduleLeaderboardSnapshot(): Promise<void> {
  await scheduleRepeatable({
    queue: getLeaderboardSnapshotQueue(),
    name: 'snapshot',
    pattern: config.leaderboard.snapshotCron,
  });
}
