import { Router } from 'express';
import * as tipsController from './tips.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';

export const tipsRouter = Router();

tipsRouter.get('/', tipsController.getTips);
tipsRouter.post('/', tipsController.record);
tipsRouter.post('/prepare', tipsController.prepare);
tipsRouter.get('/:id', tipsController.getById);
tipsRouter.patch('/:txHash/confirm', tipsController.confirm);

/** Mounted under `${API_BASE_PATH}/profiles` — tips received by a profile. */
export const profileTipsRouter = Router();
profileTipsRouter.get('/:username/tips', tipsController.getReceived);

/** Mounted under `${API_BASE_PATH}/users` — tips sent by the authenticated user. */
export const userTipsRouter = Router();
userTipsRouter.get('/me/tips/sent', requireAuth, tipsController.getSent);

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
    description: 'Id of the last item from the previous page',
  },
];
mergeOpenApiPaths({
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
        '200': { description: 'Unsigned transaction prepared' },
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
          schema: { type: 'string' },
          description: 'Tip id',
        },
      ],
      responses: {
        '200': { description: 'Tip found' },
        '400': { description: 'Validation error' },
        '404': { description: 'Tip not found' },
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
        '200': { description: 'Tip confirmed (or already confirmed)' },
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
        '200': { description: 'Tips received' },
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
        '200': { description: 'Tips sent' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
});
