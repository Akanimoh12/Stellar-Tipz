import { Router } from 'express';
import * as analyticsController from './analytics.controller.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';

export const analyticsRouter = Router();

analyticsRouter.get('/daily', analyticsController.getDailyAnalytics);
analyticsRouter.get('/summary', analyticsController.getAnalyticsSummary);
analyticsRouter.get('/volume', analyticsController.getTipVolumeController);
analyticsRouter.get('/top-tippers', analyticsController.getTopTippersController);
analyticsRouter.get('/active-users', analyticsController.getActiveUsersController);
analyticsRouter.get('/creators/:username', analyticsController.getCreatorAnalyticsController);

const base = `${env.API_BASE_PATH}/analytics`;

const analyticsDailySchema = {
  type: 'object',
  properties: {
    date: { type: 'string', example: '2026-07-24' },
    totalTips: { type: 'integer', example: 42 },
    totalVolume: { type: 'string', description: 'Total volume in stroops', example: '840000000' },
    newUsers: { type: 'integer', example: 5 },
    activeUsers: { type: 'integer', example: 18 },
  },
  required: ['date', 'totalTips', 'totalVolume', 'newUsers', 'activeUsers'],
};

mergeOpenApiPaths({
  [`${base}/daily`]: {
    get: {
      tags: ['Analytics'],
      summary: 'Get daily analytics',
      description: 'Returns paginated daily platform analytics, optionally filtered by date range.',
      parameters: [
        {
          name: 'startDate',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD)' },
        },
        {
          name: 'endDate',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date', description: 'End date (YYYY-MM-DD)' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
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
          description: 'Daily analytics entries',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: analyticsDailySchema },
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
  [`${base}/summary`]: {
    get: {
      tags: ['Analytics'],
      summary: 'Get analytics summary',
      description: 'Returns an aggregated platform summary across daily analytics within a date range.',
      parameters: [
        {
          name: 'startDate',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD)' },
        },
        {
          name: 'endDate',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date', description: 'End date (YYYY-MM-DD)' },
        },
      ],
      responses: {
        '200': {
          description: 'Analytics summary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      totalTips: { type: 'integer' },
                      totalVolume: { type: 'string' },
                      totalNewUsers: { type: 'integer' },
                      totalActiveUsers: { type: 'integer' },
                      period: {
                        type: 'object',
                        properties: {
                          start: { type: 'string', nullable: true },
                          end: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
                required: ['data'],
              },
            },
          },
        },
        '400': { description: 'Validation error' },
      },
    },
  },
  [`${base}/creators/{username}`]: {
    get: {
      tags: ['Analytics'],
      summary: 'Get creator analytics',
      description: 'Returns analytics for a specific creator including summary stats, time-series data, and top tippers.',
      parameters: [
        {
          name: 'username',
          in: 'path',
          required: true,
          schema: { type: 'string', description: 'Creator username' },
        },
        {
          name: 'startDate',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD)' },
        },
        {
          name: 'endDate',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date', description: 'End date (YYYY-MM-DD)' },
        },
        {
          name: 'granularity',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' },
        },
      ],
      responses: {
        '200': {
          description: 'Creator analytics',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      summary: {
                        type: 'object',
                        properties: {
                          totalTipsReceived: { type: 'integer' },
                          totalVolumeReceived: { type: 'string' },
                          uniqueTippers: { type: 'integer' },
                          averageTipSize: { type: 'string' },
                          firstTipDate: { type: 'string', nullable: true },
                          lastTipDate: { type: 'string', nullable: true },
                        },
                      },
                      timeSeries: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            date: { type: 'string' },
                            totalTips: { type: 'integer' },
                            totalVolume: { type: 'string' },
                            uniqueTippers: { type: 'integer' },
                          },
                        },
                      },
                      topTippers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            userId: { type: 'string' },
                            stellarAddress: { type: 'string' },
                            username: { type: 'string', nullable: true },
                            displayName: { type: 'string', nullable: true },
                            totalTipsStroops: { type: 'string' },
                            tipCount: { type: 'integer' },
                          },
                        },
                      },
                      granularity: { type: 'string' },
                      period: {
                        type: 'object',
                        properties: {
                          start: { type: 'string', nullable: true },
                          end: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '400': { description: 'Validation error' },
        '404': { description: 'Creator not found' },
      },
    },
  },
});
