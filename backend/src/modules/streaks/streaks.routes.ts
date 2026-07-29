import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import * as streaksController from './streaks.controller.js';

export const streaksRouter = Router();

streaksRouter.get('/me', requireAuth, streaksController.getMyStreak);

const base = `${env.API_BASE_PATH}/streaks`;

const streakSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'cklxyz123' },
    userId: { type: 'string', example: 'user_01' },
    currentStreak: { type: 'integer', example: 5 },
    longestStreak: { type: 'integer', example: 12 },
    lastTipDate: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'userId', 'currentStreak', 'longestStreak', 'lastTipDate', 'createdAt', 'updatedAt'],
};

mergeOpenApiPaths({
  [`${base}/me`]: {
    get: {
      tags: ['Streaks'],
      summary: 'Get my tipping streak',
      description:
        'Returns the authenticated user\'s tipping streak, including current streak, longest streak, and last tip date.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Streak data',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: streakSchema },
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
