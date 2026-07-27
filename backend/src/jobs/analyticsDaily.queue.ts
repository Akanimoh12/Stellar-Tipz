import { Queue } from 'bullmq';
import { redis } from '../db/redis.js';

export const ANALYTICS_DAILY_QUEUE = 'analytics-daily';

let queue: Queue | null = null;

export function getAnalyticsDailyQueue(): Queue {
  if (!queue) {
    queue = new Queue(ANALYTICS_DAILY_QUEUE, {
      connection: redis as any,
      defaultJobOptions: {
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    });
  }
  return queue;
}
