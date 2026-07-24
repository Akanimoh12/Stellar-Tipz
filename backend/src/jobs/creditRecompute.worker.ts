import { Worker } from 'bullmq';
import { prisma } from '../db/prisma.js';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { recalculateCreditScore } from '../modules/credit/credit.service.js';
import { CREDIT_RECOMPUTE_QUEUE, getCreditRecomputeQueue } from './creditRecompute.queue.js';

export async function recomputeAllScores(): Promise<{ processed: number; failed: number }> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await recalculateCreditScore(user.id);
      processed++;
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to recompute credit score');
      failed++;
    }
  }

  return { processed, failed };
}

export function createCreditRecomputeWorker(): Worker {
  const worker = new Worker(
    CREDIT_RECOMPUTE_QUEUE,
    async (_job) => {
      const result = await recomputeAllScores();
      logger.info(result, 'Credit score recompute complete');
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Credit recompute job failed');
  });

  return worker;
}

export async function scheduleCreditRecompute(): Promise<void> {
  const queue = getCreditRecomputeQueue();
  const repeatableJobs = await queue.getRepeatableJobs();
  const alreadyScheduled = repeatableJobs.some(
    (j) => j.name === 'recompute' && j.pattern === config.credit.recomputeCron,
  );

  if (!alreadyScheduled) {
    await queue.add(
      'recompute',
      {},
      {
        repeat: { pattern: config.credit.recomputeCron },
      },
    );
    logger.info({ cron: config.credit.recomputeCron }, 'Credit recompute scheduled');
  }
}
