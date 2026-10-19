import { Worker } from 'bullmq';
import { prisma } from '../db/prisma.js';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { recalculateCreditScore } from '../modules/credit/credit.service.js';
import { CREDIT_RECOMPUTE_QUEUE, getCreditRecomputeQueue } from './creditRecompute.queue.js';
import { scheduleRepeatable } from './scheduler.js';
import { attachDeadLetterHandler } from './deadLetter.js';
import { CREDIT_BUCKETS, bucketForCreditScore, observeCreditRun, observeCreditRunCrash, type CreditBucket } from '../common/observability/creditMetrics.js';

export async function recomputeAllScores(): Promise<{ processed: number; failed: number }> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;
  const started = Date.now();
  const distribution = Object.fromEntries(CREDIT_BUCKETS.map((bucket) => [bucket, 0])) as Record<CreditBucket, number>;
  let oldestComputedAt = Infinity;

  for (const user of users) {
    try {
      const score = await recalculateCreditScore(user.id);
      if (score && Number.isFinite(score.score)) distribution[bucketForCreditScore(score.score)]++;
      if (score?.computedAt) {
        const at = new Date(score.computedAt).getTime();
        if (Number.isFinite(at)) oldestComputedAt = Math.min(oldestComputedAt, at);
      }
      processed++;
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to recompute credit score');
      failed++;
    }
  }

  // Successful scores are new; query persisted records to detect scores for users
  // missed by this run. A failed DB query must not hide the recomputation outcome.
  try {
    const record = await prisma.creditScore.findFirst({ orderBy: { computedAt: 'asc' }, select: { computedAt: true } });
    if (record) oldestComputedAt = Math.min(oldestComputedAt, record.computedAt.getTime());
  } catch (err) {
    logger.warn({ err }, 'Could not determine oldest stored credit score');
  }
  const oldestAge = oldestComputedAt === Infinity ? -1 : Math.max(0, (Date.now() - oldestComputedAt) / 1000);
  observeCreditRun({ processed, failed }, (Date.now() - started) / 1000, distribution, oldestAge);
  return { processed, failed };
}

export function createCreditRecomputeWorker(): Worker {
  const worker = new Worker(
    CREDIT_RECOMPUTE_QUEUE,
    async (_job) => {
      const started = Date.now();
      try {
        const result = await recomputeAllScores();
        logger.info(result, 'Credit score recompute complete');
        if (result.failed > 0) throw new Error(`${result.failed} creator credit scores failed to recompute`);
      } catch (err) {
        // Partial failures have already been counted inside recomputeAllScores.
        if (!(err instanceof Error && err.message.includes('creator credit scores failed'))) {
          observeCreditRunCrash((Date.now() - started) / 1000);
        }
        throw err;
      }
    },
    { connection: redis as any },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Credit recompute job failed');
  });
  attachDeadLetterHandler(worker, CREDIT_RECOMPUTE_QUEUE);

  return worker;
}

export async function scheduleCreditRecompute(): Promise<void> {
  await scheduleRepeatable({
    queue: getCreditRecomputeQueue(),
    name: 'recompute',
    pattern: config.credit.recomputeCron,
  });
}
