import { Queue } from 'bullmq';
import { redis } from '../db/redis.js';

export const CREDIT_RECOMPUTE_QUEUE = 'credit-recompute';

let queue: Queue | null = null;

export function getCreditRecomputeQueue(): Queue {
  if (!queue) {
    queue = new Queue(CREDIT_RECOMPUTE_QUEUE, {
      connection: redis as any,
      defaultJobOptions: {
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    });
  }
  return queue;
}
