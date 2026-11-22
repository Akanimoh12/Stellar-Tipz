import type { Queue } from 'bullmq';
import { logger } from '../common/utils/logger.js';

export interface ScheduleOptions {
  /** Queue instance to register the repeatable job on. */
  queue: Queue;
  /** Unique name for the repeatable job. */
  name: string;
  /** Cron expression controlling the schedule. */
  pattern: string;
  /** Maximum number of executions of this repeatable job at once. */
  concurrency?: number;
}

/**
 * Registers a repeatable (cron) job on the given queue.
 * Idempotent — skips if the same name+pattern is already registered.
 */
export async function scheduleRepeatable({
  queue,
  name,
  pattern,
  concurrency = 1,
}: ScheduleOptions): Promise<void> {
  const repeatableJobs = await queue.getRepeatableJobs();
  const alreadyScheduled = repeatableJobs.some(
    (j) => j.name === name && j.pattern === pattern,
  );

  if (!alreadyScheduled) {
    await queue.add(name, {}, { repeat: { pattern }, jobId: `schedule-${name}` });
    logger.info({ queue: queue.name, name, pattern, concurrency }, 'Repeatable job scheduled');
  }
}
