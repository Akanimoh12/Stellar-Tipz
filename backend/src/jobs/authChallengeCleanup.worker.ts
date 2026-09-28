import { Worker } from 'bullmq';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { pruneExpiredChallenges } from '../modules/auth/auth.service.js';
import { AUTH_CHALLENGE_CLEANUP_QUEUE, getAuthChallengeCleanupQueue } from './authChallengeCleanup.queue.js';
import { scheduleRepeatable } from './scheduler.js';
import { attachDeadLetterHandler } from './deadLetter.js';

export async function cleanupExpiredChallenges(): Promise<{ pruned: number }> {
  const pruned = await pruneExpiredChallenges();
  return { pruned };
}

export function createAuthChallengeCleanupWorker(): Worker {
  const worker = new Worker(
    AUTH_CHALLENGE_CLEANUP_QUEUE,
    async (_job) => {
      const result = await cleanupExpiredChallenges();
      if (result.pruned > 0) {
        logger.info(result, 'Auth challenge cleanup complete');
      }
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Auth challenge cleanup job failed');
  });
  attachDeadLetterHandler(worker, AUTH_CHALLENGE_CLEANUP_QUEUE);

  return worker;
}

export async function scheduleAuthChallengeCleanup(): Promise<void> {
  await scheduleRepeatable({
    queue: getAuthChallengeCleanupQueue(),
    name: 'cleanup',
    pattern: config.auth.challengeCleanupCron,
  });
}
