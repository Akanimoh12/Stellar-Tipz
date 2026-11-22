import { Router } from 'express';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../../docs/openapi.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { ADMIN_ROLE, auditAdminAction } from '../admin/admin.middleware.js';
import * as moderationController from './moderation.controller.js';

export const moderationRouter = Router();

moderationRouter.use(requireAuth);
moderationRouter.post('/reports', moderationController.report);
moderationRouter.post('/appeals', moderationController.appeal);
moderationRouter.get(
  '/appeals',
  requireRole(ADMIN_ROLE),
  auditAdminAction('admin.moderation_appeals.list'),
  moderationController.listAppeals,
);
moderationRouter.patch(
  '/appeals/:appealId',
  requireRole(ADMIN_ROLE),
  moderationController.reviewAppeal,
);

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
  [`${base}/appeals`]: {
    get: {
      tags: ['Moderation'],
      summary: 'List moderation appeals',
      description: 'Lists appeals for administrator review. Admin only.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['pending', 'upheld', 'overturned'] },
        },
      ],
      responses: {
        '200': { description: 'Moderation appeals' },
        '403': { description: 'Forbidden - requires admin role' },
      },
    },
    post: {
      tags: ['Moderation'],
      summary: 'Appeal a moderation action',
      description: 'Submits an appeal for review by an administrator.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                moderationActionId: { type: 'string' },
                reason: { type: 'string', maxLength: 2_000 },
                details: { type: 'string', maxLength: 5_000 },
              },
              required: ['moderationActionId', 'reason'],
            },
          },
        },
      },
      responses: {
        '201': { description: 'Appeal submitted' },
        '400': { description: 'Invalid appeal' },
        '401': { description: 'Unauthorized' },
        '409': { description: 'An appeal already exists for this action' },
      },
    },
  },
  [`${base}/appeals/{appealId}`]: {
    patch: {
      tags: ['Moderation'],
      summary: 'Review a moderation appeal',
      description: 'Records an administrator decision on a pending appeal.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'appealId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                decision: { type: 'string', enum: ['upheld', 'overturned'] },
                notes: { type: 'string', maxLength: 5_000 },
              },
              required: ['decision'],
            },
          },
        },
      },
      responses: {
        '200': { description: 'Appeal reviewed' },
        '400': { description: 'Invalid review' },
        '403': { description: 'Forbidden - requires admin role' },
        '404': { description: 'Appeal not found' },
        '409': { description: 'Appeal already reviewed' },
      },
    },
  },
});
