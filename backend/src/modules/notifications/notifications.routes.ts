import { Router } from 'express';
import * as notificationsController from './notifications.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', notificationsController.list);
notificationsRouter.get('/unread-count', notificationsController.getUnreadCount);
notificationsRouter.get('/preferences', notificationsController.getPreferences);
notificationsRouter.patch('/preferences', notificationsController.updatePreferences);
notificationsRouter.get('/:id', notificationsController.getById);
notificationsRouter.patch('/:id/read', notificationsController.markRead);
notificationsRouter.post('/read-all', notificationsController.markAllRead);

const base = `${env.API_BASE_PATH}/notifications`;

const notificationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'clxx1234567890abcdef' },
    type: { type: 'string', example: 'tip_received' },
    payload: { type: 'object', example: { amount: '100', from: 'alice' } },
    readAt: { type: 'string', format: 'date-time', nullable: true, example: null },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'type', 'payload', 'readAt', 'createdAt'],
};

const notificationPreferenceSchema = {
  type: 'object',
  properties: {
    tipReceived: { type: 'boolean', example: true },
    goalReached: { type: 'boolean', example: true },
    subscriptionCharged: { type: 'boolean', example: true },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['tipReceived', 'goalReached', 'subscriptionCharged', 'updatedAt'],
};

mergeOpenApiPaths({
  [`${base}`]: {
    get: {
      tags: ['Notifications'],
      summary: 'List notifications',
      description: 'Returns paginated notifications for the authenticated user.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'unreadOnly',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['true', 'false'], default: 'false' },
        },
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
      ],
      responses: {
        '200': {
          description: 'Paginated list of notifications',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: notificationSchema },
                  pagination: {
                    type: 'object',
                    properties: {
                      limit: { type: 'integer' },
                      offset: { type: 'integer' },
                      total: { type: 'integer' },
                      hasMore: { type: 'boolean' },
                    },
                    required: ['limit', 'offset', 'total', 'hasMore'],
                  },
                },
                required: ['data', 'pagination'],
              },
            },
          },
        },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${base}/unread-count`]: {
    get: {
      tags: ['Notifications'],
      summary: 'Get unread notification count',
      description: 'Returns the number of unread, non-deleted notifications for the authenticated user.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Unread count',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: { count: { type: 'integer' } },
                    required: ['count'],
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
  [`${base}/preferences`]: {
    get: {
      tags: ['Notifications'],
      summary: 'Get notification preferences',
      description: 'Returns the authenticated user\'s notification type toggles, defaulting to all-enabled.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Notification preferences',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: notificationPreferenceSchema },
                required: ['data'],
              },
            },
          },
        },
        '401': { description: 'Unauthorized' },
      },
    },
    patch: {
      tags: ['Notifications'],
      summary: 'Update notification preferences',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                tipReceived: { type: 'boolean' },
                goalReached: { type: 'boolean' },
                subscriptionCharged: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated notification preferences',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: notificationPreferenceSchema },
                required: ['data'],
              },
            },
          },
        },
        '400': { description: 'Invalid request body' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${base}/{id}`]: {
    get: {
      tags: ['Notifications'],
      summary: 'Get a notification',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'Notification found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: notificationSchema },
                required: ['data'],
              },
            },
          },
        },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Notification not found' },
      },
    },
  },
  [`${base}/{id}/read`]: {
    patch: {
      tags: ['Notifications'],
      summary: 'Mark a notification as read',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'Notification marked as read',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: notificationSchema },
                required: ['data'],
              },
            },
          },
        },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Notification not found' },
      },
    },
  },
  [`${base}/read-all`]: {
    post: {
      tags: ['Notifications'],
      summary: 'Mark all notifications as read',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'All notifications marked as read',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: { count: { type: 'integer' } },
                    required: ['count'],
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
