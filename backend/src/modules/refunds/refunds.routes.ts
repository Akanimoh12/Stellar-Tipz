import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import * as refundsController from './refunds.controller.js';

export const refundsRouter = Router();

refundsRouter.get('/me', requireAuth, refundsController.getMyRefunds);
refundsRouter.post('/request', requireAuth, refundsController.requestRefund);

const base = `${env.API_BASE_PATH}/refunds`;

const refundSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'clxx1234567890abcdef' },
    tipId: { type: 'string', example: 'clxx0987654321fedcba' },
    amount: { type: 'string', example: '1000000' },
    reason: { type: 'string', example: 'Sent to the wrong creator' },
    status: { type: 'string', example: 'pending' },
    txHash: { type: 'string', nullable: true, example: null },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'tipId', 'amount', 'reason', 'status', 'txHash', 'createdAt', 'updatedAt'],
};

mergeOpenApiPaths({
  [`${base}/me`]: {
    get: {
      tags: ['Refunds'],
      summary: 'Get refund history',
      description: 'Returns paginated refund history for tips sent by the authenticated user.',
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
      ],
      responses: {
        '200': {
          description: 'Paginated refund history',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: refundSchema },
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
  [`${base}/request`]: {
    post: {
      tags: ['Refunds'],
      summary: 'Request a refund',
      description: 'Requests a refund for a confirmed tip sent by the authenticated user.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                tipTxHash: { type: 'string', description: 'Transaction hash of the tip to refund' },
                reason: { type: 'string', description: 'Reason for the refund request' },
              },
              required: ['tipTxHash', 'reason'],
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Refund requested',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: refundSchema },
                required: ['data'],
              },
            },
          },
        },
        '400': { description: 'Invalid input or tip not eligible for refund' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Tip does not belong to the authenticated user' },
        '404': { description: 'Tip not found' },
        '409': { description: 'Refund already requested for this tip' },
      },
    },
  },
});
