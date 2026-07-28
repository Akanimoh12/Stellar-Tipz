import { pathToFileURL } from 'node:url';
import { logger } from '../common/utils/logger.js';
import { registerClosable, closeAll } from '../common/utils/lifecycle.js';
import { prisma } from '../db/prisma.js';
import { startIndexer } from './poller.js';

/**
 * Standalone indexer process bootstrap. Starts the Soroban poll loop and
 * registers graceful shutdown for Prisma and the indexer.
 */
export async function bootstrapIndexer(): Promise<void> {
  registerClosable({
    name: 'Prisma',
    close: () => prisma.$disconnect(),
  });

  const indexer = startIndexer();
  registerClosable({
    name: 'Indexer',
    close: async () => {
      indexer.stop();
    },
  });

  logger.info('Indexer process started');

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down indexer...`);
    await closeAll();
    logger.info('Indexer shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  bootstrapIndexer().catch((err) => {
    logger.error({ err }, 'Fatal indexer startup error');
    process.exit(1);
  });
}
