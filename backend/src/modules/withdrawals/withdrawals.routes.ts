import { Router } from 'express';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import * as withdrawalsController from './withdrawals.controller.js';
import * as payoutsController from './payouts.controller.js';
import { deprecatedOffsetPagination } from '../../common/middleware/deprecatedOffsetPagination.js';

export const withdrawalsRouter = Router();

withdrawalsRouter.get(
  '/me',
  requireAuth,
  deprecatedOffsetPagination,
  withdrawalsController.getMyWithdrawals,
);
withdrawalsRouter.post('/prepare', requireAuth, withdrawalsController.prepareWithdrawal);
withdrawalsRouter.post('/submit', requireAuth, withdrawalsController.submitWithdrawal);

export const balancesRouter = Router();
balancesRouter.get('/me', requireAuth, withdrawalsController.getMyBalance);

// Scheduled (auto) payouts — opt-in creator configuration.
withdrawalsRouter.get('/payout-schedule', requireAuth, payoutsController.getMyPayoutSchedule);
withdrawalsRouter.put('/payout-schedule', requireAuth, payoutsController.updateMyPayoutSchedule);

const wdBase = `${env.API_BASE_PATH}/withdrawals`;
const balBase = `${env.API_BASE_PATH}/balances`;

const withdrawalSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'clxx1234567890abcdef' },
    amount: { type: 'string', example: '1000000' },
    fee: { type: 'string', example: '20000' },
    txHash: { type: 'string', nullable: true, example: 'tx-hash-abc123' },
    status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'FAILED'], example: 'PENDING' },
    requestedAt: { type: 'string', format: 'date-time' },
    confirmedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
  },
  required: ['id', 'amount', 'fee', 'txHash', 'status', 'requestedAt', 'confirmedAt'],
};

const balanceSchema = {
  type: 'object',
  properties: {
    stellarAddress: { type: 'string', example: 'GA...ADDRESS' },
    totalReceived: { type: 'string', example: '5000000' },
    totalWithdrawn: { type: 'string', example: '1000000' },
    withdrawableBalance: { type: 'string', example: '4000000' },
  },
  required: ['stellarAddress', 'totalReceived', 'totalWithdrawn', 'withdrawableBalance'],
};

const preparedWithdrawalSchema = {
  type: 'object',
  properties: {
    unsignedTxXdr: { type: 'string', example: 'AAAAAgAAAAA...' },
    destination: { type: 'string', example: 'GA...ADDRESS' },
    amount: { type: 'string', example: '1000000' },
    fee: { type: 'string', example: '20000' },
    netAmount: { type: 'string', example: '980000' },
    contractId: { type: 'string', example: 'C...CONTRACT' },
    networkPassphrase: { type: 'string', example: 'Test SDF Network ; September 2015' },
  },
  required: ['unsignedTxXdr', 'destination', 'amount', 'fee', 'netAmount', 'contractId', 'networkPassphrase'],
};

const submittedWithdrawalSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'clxx1234567890abcdef' },
    txHash: { type: 'string', example: 'tx-hash-abc123' },
    status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'FAILED'], example: 'PENDING' },
    amount: { type: 'string', example: '1000000' },
    fee: { type: 'string', example: '20000' },
    netAmount: { type: 'string', example: '980000' },
  },
  required: ['id', 'txHash', 'status', 'amount', 'fee', 'netAmount'],
};

mergeOpenApiPaths({
  [`${wdBase}/me`]: {
    get: {
      tags: ['Withdrawals'],
      summary: 'Get withdrawal history',
      description: 'Returns paginated withdrawal history for the authenticated user.',
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
          description: 'Paginated withdrawal history',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: withdrawalSchema },
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
  [`${wdBase}/prepare`]: {
    post: {
      tags: ['Withdrawals'],
      summary: 'Prepare a withdrawal',
      description: 'Builds an unsigned Soroban transaction for the authenticated user to sign with their wallet.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                amount: { type: 'string', description: 'Amount in stroops (string of digits)' },
              },
              required: ['amount'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Prepared unsigned transaction',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: preparedWithdrawalSchema },
                required: ['data'],
              },
            },
          },
        },
        '400': { description: 'Invalid amount or insufficient balance' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${wdBase}/submit`]: {
    post: {
      tags: ['Withdrawals'],
      summary: 'Submit a signed withdrawal',
      description: 'Broadcasts a wallet-signed withdrawal transaction and records it as PENDING. Idempotent by txHash.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                amount: { type: 'string', description: 'Amount in stroops (string of digits)' },
                signedTxXdr: { type: 'string', description: 'Base64-encoded signed transaction XDR' },
              },
              required: ['amount', 'signedTxXdr'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Withdrawal submitted or already recorded (idempotent)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: submittedWithdrawalSchema },
                required: ['data'],
              },
            },
          },
        },
        '400': { description: 'Invalid input, insufficient balance, or network rejection' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${balBase}/me`]: {
    get: {
      tags: ['Withdrawals'],
      summary: 'Get withdrawable balance',
      description: 'Returns the withdrawable balance for the authenticated user.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Withdrawable balance details',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: balanceSchema },
                required: ['data'],
              },
            },
          },
        },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${wdBase}/payout-schedule`]: {
    get: {
      tags: ['Withdrawals'],
      summary: 'Get my scheduled-payout configuration',
      description:
        'Returns the authenticated creator’s opt-in scheduled (auto) payout settings, or null if not configured.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Scheduled payout configuration',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    nullable: true,
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      thresholdStroops: { type: 'string' },
                      cadence: { type: 'string', enum: ['MANUAL', 'DAILY', 'WEEKLY', 'MONTHLY'] },
                      nextRunAt: { type: 'string', format: 'date-time' },
                      lastStatus: { type: 'string', nullable: true },
                      consecutiveFailures: { type: 'integer' },
                      paused: { type: 'boolean' },
                    },
                  },
                },
                required: ['data'],
              },
            },
          },
        },
        '401': { description: 'Unauthorized' },
      },
    },
    put: {
      tags: ['Withdrawals'],
      summary: 'Update my scheduled-payout configuration',
      description:
        'Opt in to (or out of) scheduled payouts. Set `enabled: false` to opt out. `thresholdStroops` is the minimum accrued balance required before a payout, and `cadence` controls recurring scheduling (MANUAL = pay as soon as the threshold is met).',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                thresholdStroops: { type: 'string', description: 'Minimum balance (stroops) to trigger a payout' },
                cadence: { type: 'string', enum: ['MANUAL', 'DAILY', 'WEEKLY', 'MONTHLY'] },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Configuration updated' },
        '400': { description: 'Invalid input' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
});
