import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import * as streaksController from './streaks.controller.js';

export const streaksRouter = Router();

streaksRouter.get('/me', requireAuth, streaksController.getMyStreak);

const base = `${env.API_BASE_PATH}/streaks`;

mergeOpenApiPaths({
  [`${base}/me`]: {
    get: {
      tags: ['Streaks'],
      summary: 'Get current tipping streak',
      description: 'Returns the authenticated user\'s current and longest tipping streak.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Streak details',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      currentStreak: { type: 'integer', example: 3 },
                      longestStreak: { type: 'integer', example: 7 },
                      lastTipDate: { type: 'string', format: 'date-time', nullable: true, example: null },
                    },
                    required: ['currentStreak', 'longestStreak', 'lastTipDate'],
                  },
                },
                required: ['data'],
              },
            },
          },
        },
        '401': { description: 'Unauthorized' },
      },
    },
  },
});
