import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import * as refundsController from './refunds.controller.js';
import { deprecatedOffsetPagination } from '../../common/middleware/deprecatedOffsetPagination.js';

export const refundsRouter = Router();

refundsRouter.get('/me', requireAuth, deprecatedOffsetPagination, refundsController.getMyRefunds);
refundsRouter.get('/received', requireAuth, refundsController.getReceivedRefunds);
refundsRouter.post('/request', requireAuth, refundsController.requestRefund);
refundsRouter.post('/:id/approve', requireAuth, refundsController.approveRefund);
refundsRouter.post('/:id/approve/submit', requireAuth, refundsController.submitApproveRefund);
refundsRouter.post('/:id/reject', requireAuth, refundsController.rejectRefund);
refundsRouter.post('/:id/reject/submit', requireAuth, refundsController.submitRejectRefund);

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
  [`${base}/received`]: {
    get: {
      tags: ['Refunds'],
      summary: 'Get received refund requests',
      description: 'Returns paginated refund requests for tips received by the authenticated creator.',
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
          description: 'Paginated received refund requests',
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
          name: 'cursor',
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: 'Opaque nextCursor returned by the previous page',
        },
        {
          name: 'offset',
          in: 'query',
          required: false,
          deprecated: true,
          schema: { type: 'integer', minimum: 0 },
          description: 'Deprecated; use cursor instead. Supported until 2027-02-28.',
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
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['data', 'nextCursor'],
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
  [`${base}/{id}/approve`]: {
    post: {
      tags: ['Refunds'],
      summary: 'Prepare refund approval',
      description: 'Builds an unsigned `approve_refund` transaction for the authenticated tip recipient to sign.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Unsigned transaction prepared' },
        '403': { description: 'Only the tip recipient may approve' },
        '404': { description: 'Refund not found' },
        '409': { description: 'Refund is not pending' },
      },
    },
  },
  [`${base}/{id}/approve/submit`]: {
    post: {
      tags: ['Refunds'],
      summary: 'Submit refund approval',
      description: 'Submits a wallet-signed `approve_refund` transaction.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { signedTxXdr: { type: 'string' } },
              required: ['signedTxXdr'],
            },
          },
        },
      },
      responses: {
        '200': { description: 'Approval transaction submitted' },
        '403': { description: 'Only the tip recipient may approve' },
        '409': { description: 'Refund is not pending' },
      },
    },
  },
  [`${base}/{id}/reject`]: {
    post: {
      tags: ['Refunds'],
      summary: 'Prepare refund rejection',
      description: 'Builds an unsigned `reject_refund` transaction for the authenticated tip recipient to sign.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { reason: { type: 'string' } },
              required: ['reason'],
            },
          },
        },
      },
      responses: {
        '200': { description: 'Unsigned transaction prepared' },
        '403': { description: 'Only the tip recipient may reject' },
        '409': { description: 'Refund is not pending' },
      },
    },
  },
  [`${base}/{id}/reject/submit`]: {
    post: {
      tags: ['Refunds'],
      summary: 'Submit refund rejection',
      description: 'Submits a wallet-signed `reject_refund` transaction.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                signedTxXdr: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['signedTxXdr', 'reason'],
            },
          },
        },
      },
      responses: {
        '200': { description: 'Rejection transaction submitted' },
        '403': { description: 'Only the tip recipient may reject' },
        '409': { description: 'Refund is not pending' },
      },
    },
  },
});
