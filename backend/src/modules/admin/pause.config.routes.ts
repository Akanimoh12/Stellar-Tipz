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

export const pauseConfigRouter = Router();
const adminGuard = [requireAuth, requireRole('admin')];

pauseConfigRouter.post('/pause/prepare', ...adminGuard, configController.prepareSetPausedController);
pauseConfigRouter.post('/pause/submit', ...adminGuard, configController.submitSetPausedController);

mergeOpenApiPaths({
  [`${base}/pause/prepare`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Prepare pause state change',
      description:
        'Builds an unsigned `set_paused` Soroban transaction for emergency stop / resumption. ' +
        'Sign the returned XDR with the admin wallet.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                paused: {
                  type: 'boolean',
                  description: 'true to pause all tipping and withdrawals; false to resume.',
                  example: true,
                },
              },
              required: ['paused'],
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
  [`${base}/pause/submit`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Submit signed pause state change',
      description: 'Submits a signed `set_paused` transaction to the Stellar network.',
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
