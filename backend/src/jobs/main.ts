import { pathToFileURL } from 'node:url';
import { logger } from '../common/utils/logger.js';
import { registerClosable, closeAll } from '../common/utils/lifecycle.js';
import { prisma } from '../db/prisma.js';
import { redis } from '../db/redis.js';
import {
  createCreditRecomputeWorker,
  scheduleCreditRecompute,
  createAnalyticsDailyWorker,
  scheduleAnalyticsDaily,
} from './index.js';

/**
 * Standalone jobs process bootstrap. Starts all BullMQ workers and registers
 * graceful shutdown for Prisma, Redis, and every worker.
 */
export async function bootstrapJobs(): Promise<void> {
  registerClosable({ name: 'Prisma', close: () => prisma.$disconnect() });
  registerClosable({ name: 'Redis', close: async () => { await redis.quit(); } });

  const creditWorker = createCreditRecomputeWorker();
  registerClosable({
    name: 'CreditRecomputeWorker',
    close: async () => {
      await creditWorker.close();
    },
  });
  await scheduleCreditRecompute();

  const analyticsWorker = createAnalyticsDailyWorker();
  registerClosable({
    name: 'AnalyticsDailyWorker',
    close: async () => {
      await analyticsWorker.close();
    },
  });
  await scheduleAnalyticsDaily();

  logger.info('Jobs process started');

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down jobs...`);
    await closeAll();
    logger.info('Jobs shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  bootstrapJobs().catch((err) => {
    logger.error({ err }, 'Fatal jobs startup error');
    process.exit(1);
  });
}
