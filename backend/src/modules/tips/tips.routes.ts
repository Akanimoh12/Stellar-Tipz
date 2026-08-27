import { Router } from 'express';
import * as tipsController from './tips.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import { deprecatedOffsetPagination } from '../../common/middleware/deprecatedOffsetPagination.js';

export const tipsRouter = Router();

tipsRouter.get('/', deprecatedOffsetPagination, tipsController.getTips);
tipsRouter.post('/', tipsController.record);
tipsRouter.post('/prepare', tipsController.prepare);
tipsRouter.get('/:id', tipsController.getById);
tipsRouter.get('/:txHash/receipt', requireAuth, tipsController.getReceipt);
tipsRouter.patch('/:txHash/confirm', tipsController.confirm);

/** Mounted under `${API_BASE_PATH}/profiles` — tips received by a profile. */
export const profileTipsRouter = Router();
profileTipsRouter.get('/:username/tips', deprecatedOffsetPagination, tipsController.getReceived);

/** Mounted under `${API_BASE_PATH}/users` — tips sent by the authenticated user. */
export const userTipsRouter = Router();
userTipsRouter.get(
  '/me/tips/sent',
  requireAuth,
  deprecatedOffsetPagination,
  tipsController.getSent,
);

const base = `${env.API_BASE_PATH}/tips`;

const paginationParameters = [
  {
    name: 'limit',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    description: 'Maximum number of tips to return',
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
];

const tipResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    txHash: { type: 'string' },
    ledger: { type: 'integer' },
    fromAddress: { type: 'string' },
    toAddress: { type: 'string' },
    amountStroops: { type: 'string', description: 'Tip amount in stroops' },
    status: { type: 'string', enum: ['PENDING', 'CONFIRMED'] },
    message: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'txHash', 'ledger', 'fromAddress', 'toAddress', 'amountStroops', 'status', 'createdAt'],
};

mergeOpenApiPaths({
  [`${base}`]: {
    get: {
      tags: ['Tips'],
      summary: 'List tips with optional filtering',
      description: 'Returns a cursor-paginated list of tips. Optionally filter by address and direction (sent/received). Use aggregate=creator to get tip totals per creator.',
      parameters: [
        ...paginationParameters,
        {
          name: 'address',
          in: 'query',
          required: false,
          schema: { type: 'string', pattern: '^G[A-Z2-7]{55}$' },
          description: 'Filter tips by Stellar address',
        },
        {
          name: 'direction',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['sent', 'received'] },
          description: 'Filter direction when address is provided',
        },
        {
          name: 'aggregate',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['creator'] },
          description: 'Aggregate tips by creator (returns totals per toAddress)',
        },
      ],
      responses: {
        '200': {
          description: 'Paginated list of tips or aggregated totals',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: tipResponseSchema,
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['data', 'nextCursor'],
              },
            },
          },
        },
        '400': { description: 'Validation error' },
      },
    },
    post: {
      tags: ['Tips'],
      summary: 'Record an on-chain tip',
      description: 'Records a tip that was submitted on-chain. Idempotent by txHash — if a tip with the given txHash already exists, returns the existing record.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                txHash: { type: 'string', description: 'Transaction hash of the tip' },
                ledger: { type: 'integer', description: 'Ledger number when the tip was recorded' },
                fromAddress: { type: 'string', description: 'Sender Stellar address' },
                toAddress: { type: 'string', description: 'Recipient Stellar address' },
                amountStroops: { type: 'string', description: 'Tip amount in stroops' },
                message: { type: 'string', description: 'Optional tip message', nullable: true },
              },
              required: ['txHash', 'ledger', 'fromAddress', 'toAddress', 'amountStroops'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Tip recorded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: tipResponseSchema,
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
  [`${base}/prepare`]: {
    post: {
      tags: ['Tips'],
      summary: 'Prepare an unsigned Soroban tip transaction',
      description: 'Builds and simulates a Soroban contract call for tipping, returning an unsigned transaction XDR for the frontend wallet to sign.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                from: { type: 'string', description: 'Sender Stellar address' },
                to: { type: 'string', description: 'Recipient Stellar address' },
                amount: { type: 'string', description: 'Tip amount in stroops' },
                message: { type: 'string', description: 'Optional tip message', maxLength: 280 },
              },
              required: ['from', 'to', 'amount'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Unsigned transaction prepared',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      unsignedTxXdr: { type: 'string', description: 'Unsigned transaction XDR for wallet signing' },
                      from: { type: 'string' },
                      to: { type: 'string' },
                      amount: { type: 'string' },
                      contractId: { type: 'string' },
                      networkPassphrase: { type: 'string' },
                    },
                    required: ['unsignedTxXdr', 'from', 'to', 'amount', 'contractId', 'networkPassphrase'],
                  },
                },
                required: ['data'],
              },
            },
          },
        },
        '400': { description: 'Validation or simulation error' },
      },
    },
  },
  [`${base}/{id}`]: {
    get: {
      tags: ['Tips'],
      summary: 'Get a single tip by id',
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', pattern: '^[a-z0-9]+$', description: 'Tip id (cuid format)' },
        },
      ],
      responses: {
        '200': {
          description: 'Tip found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: tipResponseSchema,
                },
                required: ['data'],
              },
            },
          },
        },
        '400': { description: 'Validation error' },
        '404': { description: 'Tip not found' },
      },
    },
  },
  [`${base}/{txHash}/receipt`]: {
    get: {
      tags: ['Tips'],
      summary: 'Get a structured tip receipt',
      description: 'Returns a structured receipt for the tip identified by txHash. Only the sender or recipient may fetch it. Anonymous tips return 404 to non-parties.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'txHash',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Transaction hash of the tip',
        },
      ],
      responses: {
        '200': {
          description: 'Receipt found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      txHash: { type: 'string' },
                      ledger: { type: 'integer' },
                      fromAddress: { type: 'string' },
                      toAddress: { type: 'string' },
                      amountStroops: { type: 'string', description: 'Tip amount in stroops' },
                      feeStroops: { type: 'string', description: 'Network fee in stroops' },
                      tokenCode: { type: 'string', description: 'Token code (e.g. XLM, USDC)' },
                      status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED'] },
                      message: { type: 'string', nullable: true },
                      createdAt: { type: 'string', format: 'date-time' },
                      explorerUrl: { type: 'string', description: 'Stellar Expert explorer URL for independent verification' },
                    },
                    required: ['txHash', 'ledger', 'fromAddress', 'toAddress', 'amountStroops', 'feeStroops', 'tokenCode', 'status', 'createdAt', 'explorerUrl'],
                  },
                },
                required: ['data'],
              },
            },
          },
        },
        '401': { description: 'Unauthorized — missing or invalid token' },
        '403': { description: 'Forbidden — caller is not the sender or recipient' },
        '404': { description: 'Tip not found, or anonymous tip accessed by non-party' },
      },
    },
  },
  [`${base}/{txHash}/confirm`]: {
    patch: {
      tags: ['Tips'],
      summary: 'Confirm a pending tip',
      description: 'Transitions a tip from PENDING to CONFIRMED. Idempotent — calling on an already-CONFIRMED tip is a no-op.',
      parameters: [
        {
          name: 'txHash',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Transaction hash of the tip to confirm',
        },
      ],
      responses: {
        '200': {
          description: 'Tip confirmed (or already confirmed)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: tipResponseSchema,
                },
                required: ['data'],
              },
            },
          },
        },
        '404': { description: 'Tip not found' },
      },
    },
  },
  [`${env.API_BASE_PATH}/profiles/{username}/tips`]: {
    get: {
      tags: ['Tips'],
      summary: 'List tips received by a profile',
      parameters: [
        {
          name: 'username',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Profile username',
        },
        ...paginationParameters,
      ],
      responses: {
        '200': {
          description: 'Tips received',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: tipResponseSchema,
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['data', 'nextCursor'],
              },
            },
          },
        },
        '400': { description: 'Validation error' },
        '404': { description: 'Profile not found' },
      },
    },
  },
  [`${env.API_BASE_PATH}/users/me/tips/sent`]: {
    get: {
      tags: ['Tips'],
      summary: 'List tips sent by the authenticated user',
      security: [{ bearerAuth: [] }],
      parameters: paginationParameters,
      responses: {
        '200': {
          description: 'Tips sent',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: tipResponseSchema,
                  },
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
});
