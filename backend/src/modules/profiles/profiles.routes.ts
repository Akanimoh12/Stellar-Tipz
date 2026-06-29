import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as profilesController from './profiles.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';

/** Maximum profile-update requests per window (exported for use in tests). */
export const PROFILE_UPDATE_RATE_LIMIT_MAX = 5;
/** Window duration for the profile-update rate limiter (ms). */
export const PROFILE_UPDATE_RATE_LIMIT_WINDOW_MS = 60_000;

const profileUpdateLimiter = rateLimit({
  windowMs: PROFILE_UPDATE_RATE_LIMIT_WINDOW_MS,
  max: PROFILE_UPDATE_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later' } },
});

export const profilesRouter = Router();

profilesRouter.get('/check-username', profilesController.checkUsername);
profilesRouter.get('/by-address/:address', profilesController.getByAddress);
profilesRouter.patch('/reactivate', requireAuth, profilesController.reactivate);
profilesRouter.post('/image', requireAuth, profilesController.uploadImage);
profilesRouter.patch('/me', requireAuth, profileUpdateLimiter, profilesController.update);

const base = `${env.API_BASE_PATH}/profiles`;
mergeOpenApiPaths({
  [`${base}/by-address/{address}`]: {
    get: {
      tags: ['Profiles'],
      summary: 'Look up a profile by Stellar address',
      parameters: [
        {
          name: 'address',
          in: 'path',
          required: true,
          schema: { type: 'string', pattern: '^G[A-Z2-7]{55}$' },
          description: 'Stellar public key',
        },
      ],
      responses: {
        '200': { description: 'Profile found' },
        '404': { description: 'Profile not found' },
      },
    },
  },
  [`${base}/reactivate`]: {
    patch: {
      tags: ['Profiles'],
      summary: 'Reactivate a soft-deleted profile',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Profile reactivated' },
        '400': { description: 'Profile is not deactivated' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${base}/image`]: {
    post: {
      tags: ['Profiles'],
      summary: 'Upload a profile image (pinned to IPFS)',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                dataUrl: { type: 'string', description: 'Base64-encoded image data URL' },
              },
              required: ['dataUrl'],
            },
          },
        },
      },
      responses: {
        '200': { description: 'Image uploaded and CID stored' },
        '400': { description: 'Invalid image data' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
});
