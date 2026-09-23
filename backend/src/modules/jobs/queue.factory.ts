import { Queue, Worker } from 'bullmq';
import { redis } from '@/db/redis.js';
import { env } from '@/config/env.js';
import { logger } from '@/common/utils/logger.js';

export interface QueueConfig {
  name: string;
  concurrency: number;
  description: string;
  isMoneyMoving?: boolean;
}

const queueConfigs: QueueConfig[] = [
  {
    name: 'subscription-charge',
    concurrency: env.WORKER_CONCURRENCY_SUBSCRIPTION_CHARGE,
    description: 'Process recurring subscription charges',
    isMoneyMoving: true,
  },
  {
    name: 'ipfs-pin',
    concurrency: env.WORKER_CONCURRENCY_IPFS_PIN,
    description: 'Pin content to IPFS',
  },
  {
    name: 'ipfs-cleanup',
    concurrency: env.WORKER_CONCURRENCY_IPFS_CLEANUP,
    description: 'Clean up orphaned IPFS uploads',
  },
  {
    name: 'x-refresh',
    concurrency: env.WORKER_CONCURRENCY_X_REFRESH,
    description: 'Refresh X (Twitter) metrics',
  },
];

const dbPoolBudget = env.DATABASE_POOL_SIZE;
let totalConcurrency = 0;

export const queues = new Map<string, Queue>();

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
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: { age: 3600 }, // Keep completed jobs for 1 hour
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

export async function createWorker(
  queueName: string,
  processor: (job: any) => Promise<void>
): Promise<Worker> {
  const config = queueConfigs.find((c) => c.name === queueName);
  if (!config) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  const worker = new Worker(queueName, processor, {
    connection: redis,
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

export function getQueue(name: string): Queue | undefined {
  return queues.get(name);
}

export async function closeAllQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
  logger.info('All queues closed');
}

export function getQueueConfigs(): QueueConfig[] {
  return queueConfigs;
}
