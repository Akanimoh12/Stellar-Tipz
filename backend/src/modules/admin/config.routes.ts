import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import * as configController from './config.controller.js';

export const adminConfigRouter = Router();

const adminGuard = [requireAuth, requireRole('admin')];

// ── Prepare endpoints ─────────────────────────────────────────────────────────
adminConfigRouter.post('/fee/prepare', ...adminGuard, configController.prepareSetFeeController);
adminConfigRouter.post(
  '/min-tip-amount/prepare',
  ...adminGuard,
  configController.prepareSetMinTipAmountController,
);
adminConfigRouter.post(
  '/min-withdrawal-amount/prepare',
  ...adminGuard,
  configController.prepareSetMinWithdrawalAmountController,
);
adminConfigRouter.post('/pause/prepare', ...adminGuard, configController.prepareSetPausedController);

// ── Submit endpoints ──────────────────────────────────────────────────────────
adminConfigRouter.post('/fee/submit', ...adminGuard, configController.submitSetFeeController);
adminConfigRouter.post(
  '/min-tip-amount/submit',
  ...adminGuard,
  configController.submitSetMinTipAmountController,
);
adminConfigRouter.post(
  '/min-withdrawal-amount/submit',
  ...adminGuard,
  configController.submitSetMinWithdrawalAmountController,
);
adminConfigRouter.post('/pause/submit', ...adminGuard, configController.submitSetPausedController);

// ── Timelock surface (#016) ───────────────────────────────────────────────────
adminConfigRouter.get(
  '/pending-fee-change',
  ...adminGuard,
  configController.getPendingFeeChangeController,
);

// ── OpenAPI ───────────────────────────────────────────────────────────────────

const base = `${env.API_BASE_PATH}/admin/config`;

const preparedConfigTxSchema = {
  type: 'object',
  properties: {
    unsignedTxXdr: {
      type: 'string',
      description: 'Base64-encoded unsigned Soroban transaction XDR for the admin to sign.',
      example: 'AAAAAgAAAAA...',
    },
    description: {
      type: 'string',
      description: 'Human-readable description of what this transaction will do.',
    },
    contractId: { type: 'string', example: 'C...CONTRACT' },
    networkPassphrase: { type: 'string', example: 'Test SDF Network ; September 2015' },
  },
  required: ['unsignedTxXdr', 'description', 'contractId', 'networkPassphrase'],
};

const submittedConfigTxSchema = {
  type: 'object',
  properties: {
    txHash: { type: 'string', example: 'abc123...' },
    status: { type: 'string', enum: ['PENDING', 'SUCCESS', 'ERROR'] },
  },
  required: ['txHash', 'status'],
};

const signedTxXdrProperty = {
  signedTxXdr: {
    type: 'string',
    description: 'Base64-encoded signed transaction XDR returned from the wallet.',
  },
};

const unauthorizedResponse = { description: 'Unauthorized — missing or invalid JWT' };
const forbiddenResponse = { description: 'Forbidden — requires admin role' };
const badRequestResponse = { description: 'Bad request — invalid input or contract bounds exceeded' };

mergeOpenApiPaths({
  // ── prepare: fee ────────────────────────────────────────────────────────────
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
                  description: 'New fee in basis points (0–1000, max 10%).',
                  example: 200,
                },
              },
              required: ['feeBps'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Unsigned transaction ready to be signed by the admin wallet.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    allOf: [
                      preparedConfigTxSchema,
                      {
                        properties: {
                          feeBps: { type: 'integer' },
                          isIncrease: { type: 'boolean' },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },

  // ── submit: fee ─────────────────────────────────────────────────────────────
  [`${base}/fee/submit`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Submit fee change',
      description:
        'Broadcasts a wallet-signed `propose_fee_change` transaction and writes an audit log entry. ' +
        'Both success and failure outcomes are audit-logged with before/after values.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                feeBps: { type: 'integer', minimum: 0, maximum: 1000 },
                ...signedTxXdrProperty,
              },
              required: ['feeBps', 'signedTxXdr'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Transaction submitted.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { data: submittedConfigTxSchema } },
            },
          },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },

  // ── pending fee change (timelock surface) ────────────────────────────────────
  [`${base}/pending-fee-change`]: {
    get: {
      tags: ['Admin Config'],
      summary: 'Get pending fee change',
      description:
        'Returns the currently pending timelocked fee change proposal, or null if none. ' +
        'Coordinates with #016: check `effectiveLedger` to know when a fee increase applies.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Pending fee change or null.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    nullable: true,
                    type: 'object',
                    properties: {
                      newFeeBps: { type: 'integer' },
                      currentFeeBps: { type: 'integer' },
                      effectiveLedger: { type: 'integer' },
                      proposedLedger: { type: 'integer' },
                      isDecrease: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },

  // ── prepare: min tip amount ──────────────────────────────────────────────────
  [`${base}/min-tip-amount/prepare`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Prepare min tip amount change',
      description:
        'Builds an unsigned `set_min_tip_amount` Soroban transaction. Amount must be >= 0 (stroops).',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                amount: {
                  type: 'string',
                  description: 'New minimum tip amount in stroops (non-negative integer string).',
                  example: '1000000',
                },
              },
              required: ['amount'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Unsigned transaction.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { allOf: [preparedConfigTxSchema, { properties: { amount: { type: 'string' } } }] },
                },
              },
            },
          },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },

  // ── submit: min tip amount ────────────────────────────────────────────────────
  [`${base}/min-tip-amount/submit`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Submit min tip amount change',
      description: 'Broadcasts a wallet-signed `set_min_tip_amount` transaction. Audit-logged.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { amount: { type: 'string' }, ...signedTxXdrProperty },
              required: ['amount', 'signedTxXdr'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Transaction submitted.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { data: submittedConfigTxSchema } },
            },
          },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },

  // ── prepare: min withdrawal amount ───────────────────────────────────────────
  [`${base}/min-withdrawal-amount/prepare`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Prepare min withdrawal amount change',
      description:
        'Builds an unsigned `set_min_withdrawal_amount` Soroban transaction. Amount must be >= 0 (stroops).',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                amount: {
                  type: 'string',
                  description: 'New minimum withdrawal amount in stroops (non-negative integer string).',
                  example: '1000000',
                },
              },
              required: ['amount'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Unsigned transaction.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { allOf: [preparedConfigTxSchema, { properties: { amount: { type: 'string' } } }] },
                },
              },
            },
          },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },

  // ── submit: min withdrawal amount ─────────────────────────────────────────────
  [`${base}/min-withdrawal-amount/submit`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Submit min withdrawal amount change',
      description: 'Broadcasts a wallet-signed `set_min_withdrawal_amount` transaction. Audit-logged.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { amount: { type: 'string' }, ...signedTxXdrProperty },
              required: ['amount', 'signedTxXdr'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Transaction submitted.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { data: submittedConfigTxSchema } },
            },
          },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },

  // ── prepare: pause ────────────────────────────────────────────────────────────
  [`${base}/pause/prepare`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Prepare pause/unpause',
      description:
        'Builds an unsigned `pause_contract` or `unpause_contract` transaction. ' +
        '`paused: true` pauses the contract; `paused: false` unpauses it.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                paused: { type: 'boolean', description: 'true = pause, false = unpause.' },
              },
              required: ['paused'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Unsigned transaction.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { allOf: [preparedConfigTxSchema, { properties: { paused: { type: 'boolean' } } }] },
                },
              },
            },
          },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },

  // ── submit: pause ─────────────────────────────────────────────────────────────
  [`${base}/pause/submit`]: {
    post: {
      tags: ['Admin Config'],
      summary: 'Submit pause/unpause',
      description: 'Broadcasts a wallet-signed pause or unpause transaction. Audit-logged.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { paused: { type: 'boolean' }, ...signedTxXdrProperty },
              required: ['paused', 'signedTxXdr'],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Transaction submitted.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { data: submittedConfigTxSchema } },
            },
          },
        },
        '400': badRequestResponse,
        '401': unauthorizedResponse,
        '403': forbiddenResponse,
      },
    },
  },
});
