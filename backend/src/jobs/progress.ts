import type { Job } from 'bullmq';
import { logger } from '../common/utils/logger.js';

export interface JobProgress {
  completed: number;
  total?: number;
  message?: string;
}

/** Persists progress in BullMQ and logs it so operators can follow long jobs. */
export async function reportJobProgress(job: Job | undefined, progress: JobProgress): Promise<void> {
  if (!job) return;

  await job.updateProgress(progress);
  logger.info(
    { queue: job.queueName, jobId: job.id, ...progress },
    'Background job progress',
  );
}

/** Stable identity for a repeatable/manual run so duplicate submissions collapse. */
export function jobIdempotencyKey(queue: string, name: string, identity: string): string {
  return `${queue}-${name}-${identity}`;
}
