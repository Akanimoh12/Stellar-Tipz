import { Router } from 'express';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';
import { requireAuth } from '../auth/auth.middleware.js';
import * as emailController from './email.controller.js';

export const emailRouter = Router();

emailRouter.use(requireAuth);
emailRouter.post('/notifications', emailController.send);

const base = `${env.API_BASE_PATH}/email`;

mergeOpenApiPaths({
  [`${base}/notifications`]: {
    post: {
      tags: ['Email'],
      summary: 'Send an email notification',
      description:
        'Accepts an authenticated email notification request. If EMAIL_WEBHOOK_URL is configured, the backend forwards the delivery request to that provider; otherwise it records an auditable queued delivery.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                to: { type: 'string', format: 'email' },
                subject: { type: 'string' },
                text: { type: 'string' },
                html: { type: 'string' },
                type: { type: 'string' },
                metadata: { type: 'object' },
              },
              required: ['to', 'subject', 'text'],
            },
          },
        },
      },
      responses: {
        '202': { description: 'Email notification accepted' },
        '400': { description: 'Invalid request body' },
        '401': { description: 'Unauthorized' },
        '502': { description: 'Email provider rejected the delivery request' },
      },
    },
  },
});
