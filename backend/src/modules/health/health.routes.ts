import { SorobanRpc } from '@stellar/stellar-sdk';
import { Router } from 'express';
import { config } from '../../config/index.js';
import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';
import {
  createHealthService,
  type HealthDependencies,
  type HealthService,
} from './health.service.js';

const dependencies: HealthDependencies = {
  postgres: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
  redis: async () => {
    await redis.ping();
  },
  'soroban-rpc': async () => {
    const server = new SorobanRpc.Server(config.stellar.rpcUrl, {
      allowHttp: config.stellar.rpcUrl.startsWith('http://'),
    });
    const health = await server.getHealth();
    if (health.status !== 'healthy') throw new Error('Soroban RPC reported an unhealthy status');
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
