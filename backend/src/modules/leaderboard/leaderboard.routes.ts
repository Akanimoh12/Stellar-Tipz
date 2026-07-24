import { Router } from 'express';
import * as leaderboardController from './leaderboard.controller.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', leaderboardController.getLeaderboard);
leaderboardRouter.get('/:userId', leaderboardController.getUserRank);

const base = `${env.API_BASE_PATH}/leaderboard`;

const leaderboardEntrySchema = {
  type: 'object',
  properties: {
    rank: { type: 'integer', example: 1 },
    userId: { type: 'string', example: 'clxx1234567890abcdef' },
    username: { type: 'string', nullable: true, example: 'alice' },
    stellarAddress: { type: 'string', example: 'GA...1' },
    totalTips: {
      type: 'string',
      description: 'Total confirmed tips received in stroops',
      example: '200000000',
    },
  },
  required: ['rank', 'userId', 'username', 'stellarAddress', 'totalTips'],
};

mergeOpenApiPaths({
  [`${base}`]: {
    get: {
      tags: ['Leaderboard'],
      summary: 'Get leaderboard',
      description:
        'Returns creators ranked by confirmed tip volume within a time window.',
      parameters: [
        {
          name: 'window',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['24h', '7d', 'all'], default: 'all' },
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
          description: 'Leaderboard entries',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: leaderboardEntrySchema },
                  window: { type: 'string', enum: ['24h', '7d', 'all'] },
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
                required: ['data', 'window', 'pagination'],
              },
            },
          },
        },
        '400': { description: 'Validation error' },
      },
    },
  },
  [`${base}/{userId}`]: {
    get: {
      tags: ['Leaderboard'],
      summary: 'Get a user rank on the leaderboard',
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'window',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['24h', '7d', 'all'], default: 'all' },
        },
      ],
      responses: {
        '200': { description: 'User rank found' },
        '400': { description: 'Validation error' },
        '404': { description: 'User not found on the leaderboard' },
      },
    },
  },
});
