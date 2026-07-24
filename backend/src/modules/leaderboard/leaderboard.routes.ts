import { Router } from "express";
import { getLeaderboardController } from "./leaderboard.controller.js";

/**
 * Leaderboard module router.
 * Mounted at /api/v1/leaderboard in app.ts
 *
 * Issue #933 – Leaderboard by credit score variant
 */
export const leaderboardRouter = Router();

/** Public endpoint – no auth required to view the leaderboard. */
leaderboardRouter.get("/", getLeaderboardController);
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
    totalTips: { type: 'string', description: 'Total tips received in stroops', example: '200000000' },
  },
  required: ['rank', 'userId', 'username', 'stellarAddress', 'totalTips'],
};

mergeOpenApiPaths({
  [`${base}`]: {
    get: {
      tags: ['Leaderboard'],
      summary: 'Get leaderboard',
      description: 'Returns a ranked list of creators by total tips received within a time window. Supports 24h, 7d, and all-time windows.',
      parameters: [
        {
          name: 'window',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['24h', '7d', 'all'], default: 'all' },
          description: 'Time window for tip aggregation',
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Maximum number of entries to return',
        },
        {
          name: 'offset',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 0, default: 0 },
          description: 'Number of entries to skip (for pagination)',
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
                  data: {
                    type: 'array',
                    items: leaderboardEntrySchema,
                  },
                  window: { type: 'string', enum: ['24h', '7d', 'all'], example: 'all' },
                },
                required: ['data', 'window'],
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
      description: 'Returns the rank and total tips for a specific user within a time window.',
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'User ID',
        },
        {
          name: 'window',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['24h', '7d', 'all'], default: 'all' },
          description: 'Time window for tip aggregation',
        },
      ],
      responses: {
        '200': {
          description: 'User rank found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      rank: { type: 'integer', example: 5 },
                      totalTips: { type: 'string', example: '50000000' },
                      window: { type: 'string', enum: ['24h', '7d', 'all'], example: 'all' },
                    },
                    required: ['rank', 'totalTips', 'window'],
                  },
                },
                required: ['data'],
              },
            },
          },
        },
        '400': { description: 'Validation error' },
        '404': { description: 'User not found on the leaderboard' },
      },
    },
  },
});
