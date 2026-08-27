import type { Job, Worker } from 'bullmq';
import { prisma } from '../db/prisma.js';
import { logger } from '../common/utils/logger.js';

/**
 * Persists a job that exhausted all of its retry attempts so it stays
 * inspectable after BullMQ prunes it from Redis.
 */
export async function recordDeadLetter(queue: string, job: Job, err: Error): Promise<void> {
  await prisma.deadLetterJob.create({
    data: {
      queue,
      jobId: job.id ?? null,
      jobName: job.name,
      data: job.data ?? undefined,
      failedReason: err.message,
      attemptsMade: job.attemptsMade,
    },
  });
}

/**
 * Attaches a `failed` listener to a worker that writes a DeadLetterJob row
 * once a job has no more retry attempts left. Retries in progress (a job
 * that will be attempted again) are left alone — only truly exhausted jobs
 * are dead-lettered.
 */
export function attachDeadLetterHandler(worker: Worker, queue: string): void {
  worker.on('failed', (job, err) => {
    if (!job) {
      return;
    }

    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    recordDeadLetter(queue, job, err).catch((dlqErr) => {
      logger.error({ err: dlqErr, queue, jobId: job.id }, 'Failed to record dead letter job');
    });
  });
}

export interface ListDeadLetterJobsOptions {
  queue?: string;
  limit?: number;
}

/** Lists dead-lettered jobs, most recently failed first, for inspection. */
export async function listDeadLetterJobs(options: ListDeadLetterJobsOptions = {}) {
  const { queue, limit = 50 } = options;

  return prisma.deadLetterJob.findMany({
    where: queue ? { queue } : undefined,
    orderBy: { failedAt: 'desc' },
    take: limit,
  });
}
