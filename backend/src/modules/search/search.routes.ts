import { Router } from 'express';
import * as searchController from './search.controller.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';

export const searchRouter = Router();

searchRouter.get('/creators', searchController.searchCreators);

const base = `${env.API_BASE_PATH}/search`;

const searchCreatorSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'clxx1234567890abcdef' },
    username: { type: 'string', nullable: true, example: 'alice' },
    displayName: { type: 'string', nullable: true, example: 'Alice Star' },
    stellarAddress: { type: 'string', example: 'GA...1' },
    imageUrl: { type: 'string', nullable: true },
    bio: { type: 'string', nullable: true },
  },
  required: ['id', 'stellarAddress'],
};

mergeOpenApiPaths({
  [`${base}/creators`]: {
    get: {
      tags: ['Search'],
      summary: 'Search creators by name or username',
      description:
        'Returns creators matching the query string against their username or display name. Uses case-insensitive partial matching.',
      parameters: [
        {
          name: 'q',
          in: 'query',
          required: true,
          schema: { type: 'string', minLength: 1, maxLength: 100 },
          description: 'Search query string',
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
          description: 'Matching creators',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: searchCreatorSchema },
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
  },
});
