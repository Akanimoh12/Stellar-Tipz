import { Router } from 'express';
import * as profilesController from './profiles.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths } from '../../docs/openapi.js';

export const profilesRouter = Router();

profilesRouter.post('/', requireAuth, profilesController.create);
profilesRouter.get('/by-address/:address', profilesController.getByAddress);
profilesRouter.get('/by-username/:username', profilesController.getByUsername);
profilesRouter.patch('/me', requireAuth, profilesController.update);
profilesRouter.patch('/reactivate', requireAuth, profilesController.reactivate);
profilesRouter.post('/image', requireAuth, profilesController.uploadImage);
profilesRouter.get('/check-username', profilesController.checkUsername);

const base = `${env.API_BASE_PATH}/profiles`;

mergeOpenApiPaths({
  [`${base}`]: {
    post: {
      tags: ['Profiles'],
      summary: 'Create a new profile',
      description: 'Create/initialize a profile when a user registers a username. Requires authentication.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                username: { type: 'string', description: 'Unique username (lowercase, numbers, underscores)' },
                displayName: { type: 'string', description: 'Display name' },
                bio: { type: 'string', description: 'Short bio' },
                imageUrl: { type: 'string', format: 'uri', description: 'Profile image URL' },
                avatarCid: { type: 'string', description: 'IPFS CID for avatar' },
                xHandle: { type: 'string', description: 'X (Twitter) handle' },
              },
              required: ['username'],
            },
          },
        },
      },
      responses: {
        '201': { description: 'Profile created' },
        '400': { description: 'Validation error or username taken' },
        '401': { description: 'Unauthorized' },
        '409': { description: 'Profile already exists' },
      },
    },
  },
  [`${base}/by-address/{address}`]: {
    get: {
      tags: ['Profiles'],
      summary: 'Get a profile by Stellar address',
      parameters: [
        {
          name: 'address',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Stellar wallet address',
        },
      ],
      responses: {
        '200': { description: 'Profile found' },
        '404': { description: 'Profile not found' },
      },
    },
  },
  [`${base}/by-username/{username}`]: {
    get: {
      tags: ['Profiles'],
      summary: 'Get a profile by username',
      parameters: [
        {
          name: 'username',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Profile username',
        },
      ],
      responses: {
        '200': { description: 'Profile found' },
        '404': { description: 'Profile not found' },
      },
    },
  },
  [`${base}/me`]: {
    patch: {
      tags: ['Profiles'],
      summary: 'Update own profile',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                username: { type: 'string' },
                displayName: { type: 'string' },
                bio: { type: 'string' },
                imageUrl: { type: 'string' },
                avatarCid: { type: 'string' },
                xHandle: { type: 'string' },
                minTipAmount: { type: 'string', description: 'Minimum tip amount in stroops' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Profile updated' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
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
        '400': { description: 'Profile not deactivated' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${base}/image`]: {
    post: {
      tags: ['Profiles'],
      summary: 'Upload a profile image',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                dataUrl: { type: 'string', description: 'Base64-encoded data URL of the image' },
              },
              required: ['dataUrl'],
            },
          },
        },
      },
      responses: {
        '200': { description: 'Image uploaded' },
        '400': { description: 'Invalid image data' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  [`${base}/check-username`]: {
    get: {
      tags: ['Profiles'],
      summary: 'Check if a username is available',
      parameters: [
        {
          name: 'username',
          in: 'query',
          required: true,
          schema: { type: 'string' },
          description: 'Username to check',
        },
      ],
      responses: {
        '200': { description: 'Username availability result' },
        '400': { description: 'Invalid username' },
      },
    },
  },
});
