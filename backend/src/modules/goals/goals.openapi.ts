/**
 * OpenAPI path definitions for the goals module.
 *
 * Registers paths under `${env.API_BASE_PATH}/goals` via the shared
 * `mergeOpenApiPaths` utility, aligning with the Express mount in app.ts.
 */

import { mergeOpenApiPaths } from '../../docs/openapi.js';
import { env } from '../../config/env.js';

const basePath = `${env.API_BASE_PATH}/goals`;

export function registerGoalsDocs(): void {
  mergeOpenApiPaths({
    [`${basePath}`]: {
      post: {
        tags: ['Goals'],
        summary: 'Create a funding goal',
        description: 'Creates a new funding goal for the authenticated user.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'targetStroops'],
                properties: {
                  title: { type: 'string', example: 'New streaming setup' },
                  targetStroops: {
                    type: 'string',
                    description: 'Target amount in stroops (decimal string)',
                    example: '10000000',
                  },
                  deadline: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Optional ISO-8601 deadline',
                    example: '2026-12-31T23:59:59Z',
                  },
                },
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
      get: {
        tags: ['Goals'],
        summary: 'List goals',
        description: 'Returns a paginated list of goals for a user.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'userId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'User ID to list goals for',
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 20 },
          },
        ],
        responses: {
          '200': { description: 'Paginated goal list' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    [`${basePath}/{goalId}`]: {
      get: {
        tags: ['Goals'],
        summary: 'Get a goal by ID',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'goalId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Goal object' },
          '404': { description: 'Goal not found' },
        },
      },
      patch: {
        tags: ['Goals'],
        summary: 'Update a goal',
        description: 'Updates a goal. Only the owner can update their goal.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'goalId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  targetStroops: { type: 'string' },
                  deadline: { type: 'string', format: 'date-time', nullable: true },
                  status: {
                    type: 'string',
                    enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated goal' },
          '400': { description: 'Validation error or not owner' },
          '404': { description: 'Goal not found' },
        },
      },
      delete: {
        tags: ['Goals'],
        summary: 'Delete a goal',
        description: 'Deletes a goal. Only the owner can delete their goal.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'goalId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '204': { description: 'Goal deleted, no content' },
          '400': { description: 'Not the owner' },
          '404': { description: 'Goal not found' },
        },
      },
    },
    [`${basePath}/{goalId}/progress`]: {
      get: {
        tags: ['Goals'],
        summary: 'Get goal progress',
        description:
          'Returns the goal enriched with computed progress fields: raisedPercentage, isComplete, daysRemaining.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'goalId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Goal progress object' },
          '404': { description: 'Goal not found' },
        },
      },
    },
  });
}
