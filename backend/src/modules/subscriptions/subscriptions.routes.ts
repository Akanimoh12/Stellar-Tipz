import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import * as subscriptionsController from './subscriptions.controller.js';

export const subscriptionsRouter = Router();

subscriptionsRouter.get('/me', requireAuth, subscriptionsController.getMySubscriptions);
subscriptionsRouter.post('/prepare', requireAuth, subscriptionsController.prepareCreateSubscription);
subscriptionsRouter.post('/submit', requireAuth, subscriptionsController.submitCreateSubscription);
subscriptionsRouter.post(
  '/prepare-cancel',
  requireAuth,
  subscriptionsController.prepareCancelSubscription,
);
subscriptionsRouter.post(
  '/submit-cancel',
  requireAuth,
  subscriptionsController.submitCancelSubscription,
);

const base = `${env.API_BASE_PATH}/subscriptions`;

const subscriptionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'sub_clxxtipper_clxxcreator' },
    tipperId: { type: 'string', example: 'clxxtipper' },
    tipperStellarAddress: { type: 'string', example: 'GA...TIPPER' },
    creatorId: { type: 'string', example: 'clxxcreator' },
    creatorStellarAddress: { type: 'string', example: 'GA...CREATOR' },
    amountStroops: { type: 'string', example: '10000000' },
    interval: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY'], example: 'MONTHLY' },
    nextChargeAt: { type: 'string', format: 'date-time' },
    status: {
      type: 'string',
      enum: ['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'],
      example: 'ACTIVE',
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'tipperId',
    'tipperStellarAddress',
    'creatorId',
    'creatorStellarAddress',
    'amountStroops',
    'interval',
    'nextChargeAt',
    'status',
    'createdAt',
  ],
};

const preparedTxSchema = {
  type: 'object',
  properties: {
    unsignedTxXdr: { type: 'string', example: 'AAAAAgAAAAA...' },
    contractId: { type: 'string', example: 'C...CONTRACT' },
    networkPassphrase: { type: 'string', example: 'Test SDF Network ; September 2015' },
  },
  required: ['unsignedTxXdr', 'contractId', 'networkPassphrase'],
};

const submittedCreateSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'sub_clxxtipper_clxxcreator' },
    status: {
      type: 'string',
      enum: ['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'],
      example: 'ACTIVE',
    },
    nextChargeAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'status', 'nextChargeAt'],
};

const submittedCancelSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'sub_clxxtipper_clxxcreator' },
    status: { type: 'string', enum: ['CANCELLED'], example: 'CANCELLED' },
  },
  required: ['id', 'status'],
};

mergeOpenApiPaths({
  [`${base}/me`]: {
    get: {
      tags: ['Subscriptions'],
      summary: 'List my subscriptions',
      description:
        'Returns paginated recurring tip subscriptions where the authenticated user is either the tipper or the creator.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'role',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['tipper', 'creator'], default: 'tipper' },
        },
        {
          name: 'status',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'] },
        },
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
          description: 'Paginated subscription list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: { type: 'array', items: subscriptionSchema } },
                required: ['data'],
              },
            },
          },
        },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${base}/prepare`]: {
    post: {
      tags: ['Subscriptions'],
      summary: 'Prepare a new subscription',
      description:
        'Builds an unsigned Soroban transaction calling create_subscription, for the authenticated user (as tipper) to sign with their wallet.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                creatorStellarAddress: { type: 'string' },
                amountStroops: { type: 'string', description: 'Amount in stroops per charge' },
                interval: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY'] },
              },
              required: ['creatorStellarAddress', 'amountStroops', 'interval'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Prepared unsigned transaction',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { data: preparedTxSchema }, required: ['data'] },
            },
          },
        },
        '400': { description: 'Invalid input, creator not found, or self-subscription' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${base}/submit`]: {
    post: {
      tags: ['Subscriptions'],
      summary: 'Submit a signed subscription creation',
      description:
        'Broadcasts a wallet-signed create_subscription transaction and records the subscription as ACTIVE. Safe to call again for the same (tipper, creator) pair.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                creatorStellarAddress: { type: 'string' },
                amountStroops: { type: 'string' },
                interval: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY'] },
                signedTxXdr: { type: 'string', description: 'Base64-encoded signed transaction XDR' },
              },
              required: ['creatorStellarAddress', 'amountStroops', 'interval', 'signedTxXdr'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Subscription created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: submittedCreateSchema },
                required: ['data'],
              },
            },
          },
        },
        '400': { description: 'Invalid input or network rejection' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${base}/prepare-cancel`]: {
    post: {
      tags: ['Subscriptions'],
      summary: 'Prepare a subscription cancellation',
      description:
        'Builds an unsigned Soroban transaction calling cancel_subscription, for the authenticated user to sign.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { creatorStellarAddress: { type: 'string' } },
              required: ['creatorStellarAddress'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Prepared unsigned transaction',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { data: preparedTxSchema }, required: ['data'] },
            },
          },
        },
        '400': { description: 'Subscription already cancelled' },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Subscription not found' },
      },
    },
  },
  [`${base}/submit-cancel`]: {
    post: {
      tags: ['Subscriptions'],
      summary: 'Submit a signed subscription cancellation',
      description:
        'Broadcasts a wallet-signed cancel_subscription transaction and marks the subscription CANCELLED.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                creatorStellarAddress: { type: 'string' },
                signedTxXdr: { type: 'string' },
              },
              required: ['creatorStellarAddress', 'signedTxXdr'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Subscription cancelled',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: submittedCancelSchema },
                required: ['data'],
              },
            },
          },
        },
        '400': { description: 'Invalid input or network rejection' },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Subscription not found' },
      },
    },
  },
});
