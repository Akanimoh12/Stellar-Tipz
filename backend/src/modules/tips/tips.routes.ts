import { Router } from 'express';
import * as tipsController from './tips.controller.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';

export const tipsRouter = Router();

tipsRouter.post('/prepare', tipsController.prepare);

const base = `${env.API_BASE_PATH}/tips`;
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
});
