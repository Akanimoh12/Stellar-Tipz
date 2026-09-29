import { Router } from 'express';
import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';
import {
  createHealthService,
  type HealthDependencies,
  type HealthService,
} from './health.service.js';
import { rpcCall } from '../../common/stellar/rpcClient.js';
import { getIndexerReport } from '../../indexer/monitor.js';
import { config } from '../../config/index.js';

const dependencies: HealthDependencies = {
  postgres: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  redis: async () => {
    await redis.ping();
  },
  'soroban-rpc': async () => {
    const health = await rpcCall((server) => server.getHealth(), {
      operationName: 'getHealth',
    });
    if ((health as { status: string }).status !== 'healthy') throw new Error('Soroban RPC reported an unhealthy status');
  },
  // Indexer readiness (issue #1258): the API serves stale data when the
  // indexer lags behind the chain head, so readiness must reflect that.
  indexer: async () => {
    const report = await getIndexerReport();
    if (!report.healthy) {
      throw new Error(
        `Indexer lag ${report.lagLedgers} (threshold ${config.indexer.lagThresholdLedgers})` +
          (report.stalled ? ', cursor stalled' : ''),
      );
    }
  },
};

const defaultHealthService = createHealthService(dependencies);

/** Creates the health router; an injectable service keeps dependency failures testable. */
export function createHealthRouter(service: HealthService = defaultHealthService): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.json(service.getLiveStatus());
  });

  // Keep /health useful for existing probe configurations by treating it as readiness.
  router.get(['/', '/ready'], async (_req, res, next) => {
    try {
      const result = await service.getReadyStatus();
      res.status(result.status === 'pass' ? 200 : 503).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const healthRouter = createHealthRouter();
