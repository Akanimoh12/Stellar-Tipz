import { Queue, Job } from 'bullmq';
import { redis } from '../db/redis.js';
import {
  injectTraceContextIntoJob,
  createTracedAdd,
  createTracedAddBulk,
  type TracedAddFn,
  type TracedAddBulkFn,
} from '../common/observability/bullmqTracing.js';

const queues = new Map<string, Queue>();
const tracedAddFns = new Map<string, TracedAddFn<any>>();
const tracedAddBulkFns = new Map<string, TracedAddBulkFn<any>>();

export interface QueueOptions {
  removeOnComplete?: { age: number };
  removeOnFail?: { age: number };
}

const DEFAULT_OPTIONS: Required<QueueOptions> = {
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
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

/**
 * Returns a traced version of Queue.add that automatically injects
 * the current trace context into the job payload.
 */
export function getTracedAdd<T extends Record<string, unknown> = Record<string, unknown>>(name: string): TracedAddFn<T> {
  let fn = tracedAddFns.get(name);
  if (!fn) {
    const queue = getQueue(name);
    fn = createTracedAdd(queue);
    tracedAddFns.set(name, fn);
  }
  return fn as TracedAddFn<T>;
}

/**
 * Returns a traced version of Queue.addBulk that automatically injects
 * the current trace context into each job payload.
 */
export function getTracedAddBulk<T extends Record<string, unknown> = Record<string, unknown>>(name: string): TracedAddBulkFn<T> {
  let fn = tracedAddBulkFns.get(name);
  if (!fn) {
    const queue = getQueue(name);
    fn = createTracedAddBulk(queue);
    tracedAddBulkFns.set(name, fn);
  }
  return fn as TracedAddBulkFn<T>;
}

/**
 * Adds a job with trace context propagation.
 * Convenience function that combines getQueue + traced add.
 */
export async function addJobWithTrace<T extends Record<string, unknown>>(
  name: string,
  jobName: string,
  data: T,
  opts?: any,
): Promise<Job<T>> {
  const queue = getQueue(name);
  const tracedData = injectTraceContextIntoJob(data);
  return queue.add(jobName, tracedData, opts);
}
