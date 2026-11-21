import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from '@/config/env.js';
import { logger } from './common/utils/logger.js';
import { prisma } from './db/prisma.js';
import { redis } from './db/redis.js';
import { registerClosable, closeAll } from './common/utils/lifecycle.js';
import { initRealtime, closeRealtime } from './realtime/index.js';

/** Process entry point: starts the HTTP server and the WebSocket realtime gateway. */
async function bootstrap(): Promise<void> {
  // Initialize OpenTelemetry tracing (issue #1349)
  initTracing();
  registerClosable({
    name: 'OpenTelemetry',
    close: shutdownTracing,
  });
  // Do not serve production requests against a wrong or incompatible contract.
  if (env.NODE_ENV === 'production') {
    await assertContractVersion(env.CONTRACT_ID, env.NETWORK_PASSPHRASE, env.EXPECTED_CONTRACT_VERSION);
  }
  // Prometheus registry + internal /metrics listener (issue #1346)
  await startProcessMetrics('api');

  const app = createApp();
  const httpServer = createServer(app);

  // Register Prisma and Redis for graceful shutdown.
  registerClosable({
    name: 'Prisma',
    close: () => prisma.$disconnect(),
  });
  registerClosable({
    name: 'Redis',
    close: async () => {
      await redis.quit();
    },
  });

  // Initialize realtime gateway (Socket.IO)
  initRealtime(httpServer);
  registerClosable({
    name: 'Realtime',
    close: async () => {
      await closeRealtime();
    },
  });

  httpServer.listen(env.PORT, () => {
    logger.info(`🚀 Stellar Tipz backend listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`);
    httpServer.close(async () => {
      await closeAll();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
