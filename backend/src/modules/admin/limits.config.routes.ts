import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { mergeOpenApiPaths } from '../../../docs/openapi.js';
import * as configController from './config.controller.js';
import {
  base,
  preparedConfigTxSchema,
  submittedConfigTxSchema,
  signedTxXdrProperty,
  unauthorizedResponse,
  forbiddenResponse,
  badRequestResponse,
} from './config.openapi.js';

export const limitsConfigRouter = Router();
const adminGuard = [requireAuth, requireRole('admin')];

limitsConfigRouter.post(
  '/min-tip-amount/prepare',
  ...adminGuard,
  configController.prepareSetMinTipAmountController,
);
limitsConfigRouter.post(
  '/min-tip-amount/submit',
  ...adminGuard,
  configController.submitSetMinTipAmountController,
);
limitsConfigRouter.post(
  '/min-withdrawal-amount/prepare',
  ...adminGuard,
  configController.prepareSetMinWithdrawalAmountController,
);
limitsConfigRouter.post(
  '/min-withdrawal-amount/submit',
  ...adminGuard,
  configController.submitSetMinWithdrawalAmountController,
);

mergeOpenApiPaths({
  [`${base}/min-tip-amount/prepare`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Prepare min tip amount change',
      description:
        'Builds an unsigned `set_min_tip_amount` Soroban transaction. ' +
        'Sign the returned XDR with the admin wallet.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                minTipAmount: {
                  type: 'string',
                  description: 'Minimum tip in stroops (1 XLM = 10,000,000 stroops). Positive integer string.',
                  example: '10000000',
                },
              },
              required: ['minTipAmount'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Unsigned transaction prepared successfully.',
          content: { 'application/json': { schema: preparedConfigTxSchema } },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },
  [`${base}/min-tip-amount/submit`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Submit signed min tip amount change',
      description: 'Submits a signed `set_min_tip_amount` transaction to the Stellar network.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: signedTxXdrProperty,
              required: ['signedTxXdr'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Transaction submitted.',
          content: { 'application/json': { schema: submittedConfigTxSchema } },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },
  [`${base}/min-withdrawal-amount/prepare`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Prepare min withdrawal amount change',
      description:
        'Builds an unsigned `set_min_withdrawal_amount` Soroban transaction. ' +
        'Sign the returned XDR with the admin wallet.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                minWithdrawalAmount: {
                  type: 'string',
                  description: 'Minimum withdrawal in stroops (1 XLM = 10,000,000 stroops). Positive integer string.',
                  example: '10000000',
                },
              },
              required: ['minWithdrawalAmount'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Unsigned transaction prepared successfully.',
          content: { 'application/json': { schema: preparedConfigTxSchema } },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },
  [`${base}/min-withdrawal-amount/submit`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Submit signed min withdrawal amount change',
      description: 'Submits a signed `set_min_withdrawal_amount` transaction to the Stellar network.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: signedTxXdrProperty,
              required: ['signedTxXdr'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Transaction submitted.',
          content: { 'application/json': { schema: submittedConfigTxSchema } },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },
});
