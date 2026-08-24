import { Router } from 'express';
import { requireAuth } from '../../modules/auth/auth.middleware.js';
import { requireRole } from '../../modules/auth/auth.middleware.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import * as adminController from './admin.controller.js';

export const adminRouter = Router();

// Admin-only routes
adminRouter.get(
  '/audit-logs',
  requireAuth,
  requireRole('admin'),
  adminController.listAuditLogsController,
);
adminRouter.get(
  '/stats',
  requireAuth,
  requireRole('admin'),
  adminController.getPlatformStatsController,
);
adminRouter.post(
  '/audit-log',
  requireAuth,
  requireRole('admin'),
  adminController.createAuditLogController,
);

const base = `${env.API_BASE_PATH}/admin`;

const auditLogSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    actor: { type: 'string' },
    action: { type: 'string' },
    target: { type: 'string', nullable: true },
    metadata: { type: 'object' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'actor', 'action', 'createdAt'],
};

const platformStatsSchema = {
  type: 'object',
  properties: {
    totalUsers: { type: 'number' },
    totalCreators: { type: 'number' },
    totalTips: { type: 'number' },
    totalTipAmountStroops: { type: 'string' },
    activeUsersLast30Days: { type: 'number' },
    totalSubscriptions: { type: 'number' },
    totalRefunds: { type: 'number' },
    averageTipAmount: { type: 'string' },
  },
  required: [
    'totalUsers',
    'totalCreators',
    'totalTips',
    'totalTipAmountStroops',
    'activeUsersLast30Days',
    'totalSubscriptions',
    'totalRefunds',
    'averageTipAmount',
  ],
};

mergeOpenApiPaths({
  [`${base}/audit-logs`]: {
    get: {
      tags: ['Admin'],
      summary: 'List audit logs',
      description: 'Returns audit logs with optional filtering. Admin only.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        {
          name: 'offset',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 0, default: 0 },
        },
        {
          name: 'action',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'actor',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'List of audit logs',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: auditLogSchema },
                },
              },
            },
          },
        },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden - requires admin role' },
      },
    },
  },
  [`${base}/stats`]: {
    get: {
      tags: ['Admin'],
      summary: 'Get platform statistics',
      description: 'Returns platform-wide statistics. Admin only.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Platform statistics',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: platformStatsSchema },
              },
            },
          },
        },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden - requires admin role' },
      },
    },
  },
});
