import { Queue } from 'bullmq';
import { redis } from '../db/redis.js';

const queues = new Map<string, Queue>();

export interface QueueOptions {
  removeOnComplete?: { age: number };
  removeOnFail?: { age: number };
  attempts?: number;
  backoff?: { type: 'exponential'; delay: number };
}

const DEFAULT_OPTIONS: Required<QueueOptions> = {
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
};

/**
 * Returns a lazily-initialized, singleton BullMQ Queue for the given name.
 * All queues share the same Redis connection and default job options.
 */
export function getQueue(name: string, overrides?: QueueOptions): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: redis as any,
      defaultJobOptions: { ...DEFAULT_OPTIONS, ...overrides },
    });
    queues.set(name, queue);
  }
  return queue;
}
