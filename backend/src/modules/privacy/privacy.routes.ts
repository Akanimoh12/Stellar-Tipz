import { Router } from 'express';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import { requireAuth } from '../auth/auth.middleware.js';
import * as privacyController from './privacy.controller.js';

export const privacyRouter = Router();

privacyRouter.use(requireAuth);
privacyRouter.get('/export', privacyController.exportData);
privacyRouter.delete('/account', privacyController.removeAccount);

const base = `${env.API_BASE_PATH}/privacy`;

mergeOpenApiPaths({
  [`${base}/export`]: {
    get: {
      tags: ['Privacy'],
      summary: 'Export authenticated user data',
      description:
        'Returns a portable JSON export containing the authenticated user profile and related records for GDPR data portability.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Portable account export' },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Account not found' },
      },
    },
  },
  [`${base}/account`]: {
    delete: {
      tags: ['Privacy'],
      summary: 'Delete authenticated account',
      description:
        'Soft-deletes the account, revokes local credentials, disables user-owned webhook/API surfaces, and returns pending on-chain tips/withdrawals that require reconciliation.',
      security: [{ bearerAuth: [] }],
      responses: {
        '202': { description: 'Account deletion accepted with reconciliation summary' },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Account not found' },
      },
    },
  },
});
