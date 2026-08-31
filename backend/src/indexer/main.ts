import { pathToFileURL } from 'node:url';
import { logger } from '../common/utils/logger.js';
import { registerClosable, closeAll } from '../common/utils/lifecycle.js';
import { prisma, prismaIncludingDeleted } from '../db/prisma.js';
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
  registerClosable({
    name: 'PrismaIncludingDeleted',
    close: () => prismaIncludingDeleted.$disconnect(),
  });

  const indexer = startIndexer();
  registerClosable({
    name: 'Indexer',
    close: async () => {
      await indexer.stop();
    },
  });

  logger.info('Indexer process started');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down indexer...`);
    const completed = await closeAllWithTimeout(30_000, () => process.exit(1));
    if (completed) {
      logger.info('Indexer shutdown complete');
      process.exit(0);
    }
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
