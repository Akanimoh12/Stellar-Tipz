import { Queue, Worker, Job } from 'bullmq';
import { bullConnection } from '../db/redis.js';
import { env } from '../config/env.js';
import { logger } from '../common/utils/logger.js';
import {
  injectTraceContextIntoJob,
  createTracedAdd,
  createTracedAddBulk,
  type TracedAddFn,
  type TracedAddBulkFn,
} from '../common/observability/bullmqTracing.js';

export const queues = new Map<string, Queue>();
const tracedAddFns = new Map<string, TracedAddFn<any>>();
const tracedAddBulkFns = new Map<string, TracedAddBulkFn<any>>();

export interface QueueOptions {
  removeOnComplete?: { age: number };
  removeOnFail?: { age: number };
  attempts?: number;
  backoff?: { type: 'exponential'; delay: number };
}

export interface QueueConfig {
  name: string;
  concurrency: number;
  description: string;
  isMoneyMoving?: boolean;
}

const DEFAULT_OPTIONS: Required<QueueOptions> = {
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
};

const queueConfigs: QueueConfig[] = [
  {
    name: 'subscription-charge',
    concurrency: env?.WORKER_CONCURRENCY_SUBSCRIPTION_CHARGE ?? 2,
    description: 'Process recurring subscription charges',
    isMoneyMoving: true,
  },
  {
    name: 'ipfs-pin',
    concurrency: env?.WORKER_CONCURRENCY_IPFS_PIN ?? 3,
    description: 'Pin content to IPFS',
  },
  {
    name: 'ipfs-cleanup',
    concurrency: env?.WORKER_CONCURRENCY_IPFS_CLEANUP ?? 2,
    description: 'Clean up orphaned IPFS uploads',
  },
  {
    name: 'x-refresh',
    concurrency: env?.WORKER_CONCURRENCY_X_REFRESH ?? 1,
    description: 'Refresh X (Twitter) metrics',
  },
];

const dbPoolBudget = env?.DATABASE_POOL_SIZE ?? 10;
let totalConcurrency = 0;

/**
 * Returns a lazily-initialized, singleton BullMQ Queue for the given name.
 * All queues share the same Redis connection and default job options.
 */
export function getQueue(name: string, overrides?: QueueOptions): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: bullConnection,
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

/**
 * Pre-initializes all configured queues and validates concurrency against DB pool budget.
 */
export async function initializeQueues(): Promise<void> {
  logger.info('Initializing job queues...');

  totalConcurrency = queueConfigs.reduce((sum, cfg) => sum + cfg.concurrency, 0);

  if (totalConcurrency > dbPoolBudget) {
    logger.warn(
      {
        totalConcurrency,
        dbPoolBudget,
        deficit: totalConcurrency - dbPoolBudget,
      },
      '⚠️  WARNING: Total worker concurrency exceeds database connection pool budget! ' +
        'This may exhaust connections and cause pool starvation. ' +
        'Adjust WORKER_CONCURRENCY_* or DATABASE_POOL_SIZE environment variables.'
    );
  }

  for (const config of queueConfigs) {
    const queue = new Queue(config.name, {
      connection: bullConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: { age: 3600 },
      },
    });

    queues.set(config.name, queue);
    logger.info(
      { queue: config.name, concurrency: config.concurrency },
      `Queue initialized: ${config.description}`
    );
  }

  logger.info(
    { totalQueues: queues.size, totalConcurrency, dbPoolBudget },
    'All queues initialized'
  );
}

/**
 * Creates a BullMQ worker for the specified queue with configured concurrency.
 */
export async function createWorker(
  queueName: string,
  processor: (job: any) => Promise<void>
): Promise<Worker> {
  const config = queueConfigs.find((c) => c.name === queueName);
  if (!config) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  const worker = new Worker(queueName, processor, {
    connection: bullConnection,
    concurrency: config.concurrency,
    maxStalledCount: 2,
    stalledInterval: 30000,
  });

  worker.on('error', (err) => {
    logger.error({ error: err, queue: queueName }, 'Worker error');
  });

  logger.info({ queue: queueName }, 'Worker created');
  return worker;
}

/**
 * Gracefully closes all active queues.
 */
export async function closeAllQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
  logger.info('All queues closed');
}

/**
 * Returns the list of standard queue configurations.
 */
export function getQueueConfigs(): QueueConfig[] {
  return queueConfigs;
}
