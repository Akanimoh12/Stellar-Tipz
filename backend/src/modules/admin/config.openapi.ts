import { env } from '../../config/env.js';

export const base = `${env.API_BASE_PATH}/admin/config`;

export const preparedConfigTxSchema = {
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

export const submittedConfigTxSchema = {
  type: 'object',
  properties: {
    txHash: { type: 'string', example: 'abc123...' },
    status: { type: 'string', enum: ['PENDING', 'SUCCESS', 'ERROR'] },
  },
  required: ['txHash', 'status'],
};

export const signedTxXdrProperty = {
  signedTxXdr: {
    type: 'string',
    description: 'Base64-encoded signed transaction XDR returned from the wallet.',
  },
};

export const unauthorizedResponse = { description: 'Unauthorized — missing or invalid JWT' };
export const forbiddenResponse = { description: 'Forbidden — requires admin role' };
export const badRequestResponse = { description: 'Bad request — invalid input or contract bounds exceeded' };
