import { Router } from 'express';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import { requireAuth } from '../auth/auth.middleware.js';
import * as moderationController from './moderation.controller.js';

export const moderationRouter = Router();

moderationRouter.use(requireAuth);
moderationRouter.post('/reports', moderationController.report);

const base = `${env.API_BASE_PATH}/moderation`;

mergeOpenApiPaths({
  [`${base}/reports`]: {
    post: {
      tags: ['Moderation'],
      summary: 'Report abusive or suspicious content',
      description:
        'Creates an auditable moderation report for a profile, tip, goal, subscription, message, or other target.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                targetType: {
                  type: 'string',
                  enum: ['profile', 'tip', 'goal', 'subscription', 'message', 'other'],
                },
                targetId: { type: 'string' },
                reason: {
                  type: 'string',
                  enum: ['spam', 'harassment', 'impersonation', 'fraud', 'illegal_content', 'other'],
                },
                details: { type: 'string' },
              },
              required: ['targetType', 'targetId', 'reason'],
            },
          },
        },
      },
      responses: {
        '201': { description: 'Report accepted' },
        '400': { description: 'Invalid request body' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
});
