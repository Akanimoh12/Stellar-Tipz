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

export const feeConfigRouter = Router();
const adminGuard = [requireAuth, requireRole('admin')];

feeConfigRouter.post('/fee/prepare', ...adminGuard, configController.prepareSetFeeController);
feeConfigRouter.post('/fee/submit', ...adminGuard, configController.submitSetFeeController);
feeConfigRouter.get('/pending-fee-change', ...adminGuard, configController.getPendingFeeChangeController);

mergeOpenApiPaths({
  [`${base}/fee/prepare`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Prepare fee change',
      description:
        'Builds an unsigned `propose_fee_change` Soroban transaction. Fee increases are timelocked on-chain. ' +
        'The server never holds the admin key; sign the returned XDR with the admin wallet.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                feeBps: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 1000,
                  description: 'Platform fee in basis points (1 bp = 0.01%). Maximum 1000 (10%).',
                  example: 250,
                },
              },
              required: ['feeBps'],
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
  [`${base}/fee/submit`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Submit signed fee change',
      description:
        'Submits a signed `propose_fee_change` transaction to the Stellar network. ' +
        'If the fee was decreased, the new fee takes effect immediately. ' +
        'If the fee was increased, the timelock begins and `pending-fee-change` reports the unlock ledger.',
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
  [`${base}/pending-fee-change`]: {
    get: {
      tags: ['Admin Config'],
      summary: 'Get pending timelocked fee change',
      description:
        'Returns the current state of any timelocked fee increase on the contract (#016). ' +
        '`status` is NONE (no change proposed), PENDING (timelock active, cannot be applied yet), ' +
        'or READY (timelock expired, can now be executed on-chain).',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Pending fee change details.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['NONE', 'PENDING', 'READY'],
                    example: 'PENDING',
                  },
                  proposedFeeBps: {
                    type: 'integer',
                    nullable: true,
                    description: 'Proposed fee in basis points, or null if status is NONE.',
                    example: 300,
                  },
                  effectiveLedger: {
                    type: 'integer',
                    nullable: true,
                    description: 'Ledger sequence at which the fee becomes applicable, or null if NONE.',
                    example: 1234567,
                  },
                  currentLedger: {
                    type: 'integer',
                    description: 'Current ledger sequence read from the RPC.',
                    example: 1234000,
                  },
                  remainingLedgers: {
                    type: 'integer',
                    description: 'Ledgers until the change is effective (0 when status is READY or NONE).',
                    example: 567,
                  },
                },
                required: ['status', 'proposedFeeBps', 'effectiveLedger', 'currentLedger', 'remainingLedgers'],
              },
            },
          },
        },
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },
});
