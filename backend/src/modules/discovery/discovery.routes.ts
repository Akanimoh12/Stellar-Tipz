import { Router } from 'express';
import * as discoveryController from './discovery.controller.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths, type OpenApiPaths } from '../../docs/openapi.js';
import { TRENDING_FORMULA_DESCRIPTION } from './discovery.types.js';

export const discoveryRouter = Router();

discoveryRouter.get('/trending', discoveryController.getTrending);
discoveryRouter.get('/similar/:username', discoveryController.getSimilar);

const base = `${env.API_BASE_PATH}/discover`;

const creatorEntry = {
  type: 'object',
  properties: {
    rank: { type: 'integer', example: 1 },
    userId: { type: 'string', example: 'clxx1234567890abcdef' },
    username: { type: 'string', nullable: true, example: 'alice' },
    stellarAddress: { type: 'string', example: 'GA...1' },
    displayName: { type: 'string', nullable: true, example: 'Alice' },
    imageUrl: { type: 'string', nullable: true, example: 'https://...' },
    avatarCid: { type: 'string', nullable: true, example: 'bafy...' },
    trendingScore: { type: 'number', example: 184320.5 },
    recentVolumeStroops: { type: 'string', example: '250000000' },
    recentTipCount: { type: 'integer', example: 12 },
  },
  required: [
    'rank',
    'userId',
    'username',
    'stellarAddress',
    'displayName',
    'imageUrl',
    'avatarCid',
    'trendingScore',
    'recentVolumeStroops',
    'recentTipCount',
  ],
};

const paths: OpenApiPaths = {
  [`${base}/trending`]: {
    get: {
      tags: ['Discovery'],
      summary: 'Get trending creators',
      description: TRENDING_FORMULA_DESCRIPTION,
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
      ],
      responses: {
        '200': {
          description: 'Trending creators ranked by recency-weighted tip volume',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: creatorEntry },
                  windowDays: { type: 'integer', example: 14 },
                  generatedAt: { type: 'string', format: 'date-time' },
                  stale: { type: 'boolean', example: false },
                },
                required: ['data', 'windowDays', 'generatedAt', 'stale'],
              },
            },
          },
        },
        '400': { description: 'Validation error' },
      },
    },
  },
  [`${base}/similar/{username}`]: {
    get: {
      tags: ['Discovery'],
      summary: 'Get creators similar to a given creator',
      description:
        'Returns creators who share the most supporters with `username`, ranked by the number of distinct overlapping tippers. Deactivated, blocked, and unverified-flagged creators are excluded.',
      parameters: [
        {
          name: 'username',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      ],
      responses: {
        '200': {
          description: 'Similar creators',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        username: { type: 'string', nullable: true, example: 'bob' },
                        stellarAddress: { type: 'string', example: 'GA...2' },
                        displayName: { type: 'string', nullable: true, example: 'Bob' },
                        imageUrl: { type: 'string', nullable: true },
                        avatarCid: { type: 'string', nullable: true },
                        sharedSupporters: { type: 'integer', example: 7 },
                        supporterCount: { type: 'integer', example: 7 },
                      },
                      required: [
                        'username',
                        'stellarAddress',
                        'displayName',
                        'imageUrl',
                        'avatarCid',
                        'sharedSupporters',
                        'supporterCount',
                      ],
                    },
                  },
                  forUsername: { type: 'string', example: 'alice' },
                  generatedAt: { type: 'string', format: 'date-time' },
                  stale: { type: 'boolean', example: false },
                },
                required: ['data', 'forUsername', 'generatedAt', 'stale'],
              },
            },
          },
        },
        '400': { description: 'Validation error' },
        '404': { description: 'Creator not found' },
      },
    },
  },
};

mergeOpenApiPaths(paths);
