import { Router } from 'express';
import { requireAuth, requireRole } from '../../modules/auth/auth.middleware.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import { ADMIN_ROLE, auditAdminAction } from './admin.middleware.js';
import * as adminController from './admin.controller.js';

export const adminRouter = Router();

/** Every admin route sits behind a valid access token *and* the admin role. */
const adminGuard = [requireAuth, requireRole(ADMIN_ROLE)];

adminRouter.get(
  '/audit-logs',
  ...adminGuard,
  auditAdminAction('admin.audit_logs.list'),
  adminController.listAuditLogsController,
);
adminRouter.get(
  '/stats',
  ...adminGuard,
  auditAdminAction('admin.stats.read'),
  adminController.getPlatformStatsController,
);
// No auditAdminAction here: the controller writes the caller-supplied audit
// entry itself, and wrapping it would record every call twice.
adminRouter.post('/audit-log', ...adminGuard, adminController.createAuditLogController);

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
  [`${base}/audit-log`]: {
    post: {
      tags: ['Admin'],
      summary: 'Record an audit log entry',
      description: 'Records an admin action in the audit trail. Admin only.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                action: { type: 'string', maxLength: 255, example: 'admin.user.ban' },
                target: { type: 'string', nullable: true, example: 'user-1' },
                metadata: { type: 'object', example: { reason: 'spam' } },
              },
              required: ['action'],
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Created audit log entry',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: auditLogSchema },
              },
            },
          },
        },
        '400': { description: 'Invalid request body' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden - requires admin role' },
      },
    },
  },
});
