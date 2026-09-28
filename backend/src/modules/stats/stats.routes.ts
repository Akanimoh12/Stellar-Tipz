import { Router } from 'express';
import * as statsController from './stats.controller.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths, type OpenApiPaths } from '../../docs/openapi.js';
import { createRateLimiter } from '../../common/middleware/rateLimiter.js';

export const statsRouter = Router();

// Public, unauthenticated, but rate-limited harder than the global default.
statsRouter.get(
  '/platform',
  createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30, keyPrefix: 'rl:stats:' }),
  statsController.getPlatformStats,
);

const base = `${env.API_BASE_PATH}/stats`;

const paths: OpenApiPaths = {
  [`${base}/platform`]: {
    get: {
      tags: ['Stats'],
      summary: 'Get public platform statistics',
      description:
        'Returns aggregate platform stats (total tips, total volume, creator count, 24h activity). Values are precomputed by a background job and served from cache. If the data source is unavailable the endpoint returns null fields with `stale: true` rather than fabricating numbers.',
      responses: {
        '200': {
          description: 'Platform statistics',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  totalTips: { type: 'integer', nullable: true, example: 12450 },
                  totalVolumeStroops: { type: 'string', nullable: true, example: '982341000000' },
                  creatorCount: { type: 'integer', nullable: true, example: 1832 },
                  activity24h: {
                    type: 'object',
                    properties: {
                      tips: { type: 'integer', nullable: true, example: 320 },
                      volumeStroops: { type: 'string', nullable: true, example: '5120000000' },
                    },
                    required: ['tips', 'volumeStroops'],
                  },
                  generatedAt: { type: 'string', format: 'date-time' },
                  stale: { type: 'boolean', example: false },
                },
                required: [
                  'totalTips',
                  'totalVolumeStroops',
                  'creatorCount',
                  'activity24h',
                  'generatedAt',
                  'stale',
                ],
              },
            },
          },
        },
        '429': { description: 'Rate limit exceeded' },
      },
    },
  },
};

mergeOpenApiPaths(paths);
