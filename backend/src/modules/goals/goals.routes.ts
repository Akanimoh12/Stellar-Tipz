import { Router } from 'express';
import * as goalsController from './goals.controller.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import { authMiddleware } from '../auth/auth.middleware.js';

export const goalsRouter = Router();

goalsRouter.get('/', goalsController.listGoals);
goalsRouter.get('/:id', goalsController.getGoal);
goalsRouter.post('/', authMiddleware, goalsController.createGoal);
goalsRouter.put('/:id', authMiddleware, goalsController.updateGoal);
goalsRouter.delete('/:id', authMiddleware, goalsController.deleteGoal);

const base = `${env.API_BASE_PATH}/goals`;

const goalSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'clxx1234567890abcdef' },
    userId: { type: 'string', example: 'user-1' },
    title: { type: 'string', example: 'New Video Camera' },
    targetStroops: { type: 'string', example: '1000000000' },
    raisedStroops: { type: 'string', example: '250000000' },
    progress: { type: 'integer', example: 25 },
    deadline: { type: 'string', nullable: true, format: 'date-time' },
    status: { type: 'string', enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'userId', 'title', 'targetStroops', 'raisedStroops', 'progress', 'status', 'createdAt', 'updatedAt'],
};

mergeOpenApiPaths({
  [`${base}`]: {
    get: {
      tags: ['Goals'],
      summary: 'List goals',
      description: 'Returns paginated goals, optionally filtered by status or userId.',
      parameters: [
        {
          name: 'status',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED'] },
        },
        {
          name: 'userId',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
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
          description: 'Goals list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: goalSchema },
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
        '400': { description: 'Validation error' },
      },
    },
    post: {
      tags: ['Goals'],
      summary: 'Create a goal',
      description: 'Creates a new funding goal for the authenticated user.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string', minLength: 1, maxLength: 200, example: 'New Video Camera' },
                targetStroops: { type: 'string', example: '1000000000' },
                deadline: { type: 'string', format: 'date-time', nullable: true },
              },
              required: ['title', 'targetStroops'],
            },
          },
        },
      },
      responses: {
        '201': { description: 'Goal created' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${base}/{id}`]: {
    get: {
      tags: ['Goals'],
      summary: 'Get a goal by ID',
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
          description: 'Goal found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: goalSchema,
                },
                required: ['data'],
              },
            },
          },
        },
        '404': { description: 'Goal not found' },
      },
    },
    put: {
      tags: ['Goals'],
      summary: 'Update a goal',
      description: 'Updates a goal. Only the owner can update.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'id',
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
                title: { type: 'string', minLength: 1, maxLength: 200 },
                targetStroops: { type: 'string' },
                deadline: { type: 'string', format: 'date-time', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Goal updated' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden - not the owner' },
        '404': { description: 'Goal not found' },
      },
    },
    delete: {
      tags: ['Goals'],
      summary: 'Delete a goal',
      description: 'Soft-deletes a goal. Only the owner can delete.',
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
        '204': { description: 'Goal deleted' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden - not the owner' },
        '404': { description: 'Goal not found' },
      },
    },
  },
});
import { requireAuth } from '../auth/auth.middleware.js';
import {
  createGoalController,
  listGoalsController,
  getGoalController,
  updateGoalController,
  deleteGoalController,
  getGoalProgressController,
} from './goals.controller.js';

/**
 * Goals module router.
 * Mounted at /api/v1/goals in app.ts
 */
export const goalsRouter = Router();

/** All goal routes require authentication. */
goalsRouter.post('/', requireAuth, createGoalController);
goalsRouter.get('/', requireAuth, listGoalsController);
goalsRouter.get('/:goalId', requireAuth, getGoalController);
goalsRouter.patch('/:goalId', requireAuth, updateGoalController);
goalsRouter.delete('/:goalId', requireAuth, deleteGoalController);
goalsRouter.get('/:goalId/progress', requireAuth, getGoalProgressController);
