/**
 * OpenAPI path definitions for the auth module.
 *
 * Registers paths under `${env.API_BASE_PATH}/auth` via the shared
 * `mergeOpenApiPaths` utility, aligning with the Express mount in app.ts.
 */

import { mergeOpenApiPaths } from '../../docs/openapi.js';
import { env } from '../../config/env.js';

const basePath = `${env.API_BASE_PATH}/auth`;

export function registerAuthDocs(): void {
  mergeOpenApiPaths({
    [`${basePath}/challenge`]: {
      post: {
        tags: ['Auth'],
        summary: 'Create authentication challenge',
        description:
          'Generate a challenge for a Stellar address. The challenge must be signed by the address private key and verified via the /verify endpoint. Rate-limited per IP and per Stellar address.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['address'],
                properties: {
                  address: {
                    type: 'string',
                    description: 'Stellar public address (G...)',
                    example: 'GBRPYHIL2CI3FV4BMSXIUFC6MBIXKSTX6DYRSAJQR34ZDNEXI2QY5P7Z',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Challenge created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    challenge: { type: 'string', description: 'Base64-encoded challenge to sign' },
                    expiresIn: { type: 'integer', description: 'Challenge TTL in seconds' },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid address' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    [`${basePath}/verify`]: {
      post: {
        tags: ['Auth'],
        summary: 'Verify signed challenge and obtain tokens',
        description:
          'Verify a challenge signed by the Stellar address private key. Returns access and refresh tokens on success. Rate-limited per IP and per Stellar address.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['address', 'signedChallenge'],
                properties: {
                  address: {
                    type: 'string',
                    description: 'Stellar public address',
                    example: 'GBRPYHIL2CI3FV4BMSXIUFC6MBIXKSTX6DYRSAJQR34ZDNEXI2QY5P7Z',
                  },
                  signedChallenge: {
                    type: 'string',
                    description: 'XDR-encoded signed challenge',
                    example: 'AAAAAI...',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string', description: 'JWT access token (15 min TTL)' },
                    refreshToken: { type: 'string', description: 'Refresh token (30 day TTL)' },
                    user: { type: 'object', description: 'User profile summary' },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid signature or expired challenge' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    [`${basePath}/me`]: {
      get: {
        tags: ['Auth'],
        summary: 'Get current authenticated user',
        description: 'Returns the authenticated user profile and session info. Requires valid access token.',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user profile',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    address: { type: 'string' },
                    username: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    [`${basePath}/refresh`]: {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        description: 'Exchange a refresh token for a new access token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'New access token issued',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': { description: 'Invalid or expired refresh token' },
        },
      },
    },
    [`${basePath}/logout`]: {
      post: {
        tags: ['Auth'],
        summary: 'Logout (revoke refresh token)',
        description: 'Revokes the refresh token, ending the session.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '204': { description: 'Logout successful' },
          '400': { description: 'Invalid token' },
        },
      },
    },
    [`${basePath}/sessions`]: {
      get: {
        tags: ['Auth'],
        summary: 'List active sessions',
        description: 'Returns a list of active sessions for the authenticated user.',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of active sessions',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      userAgent: { type: 'string' },
                      createdAt: { type: 'string', format: 'date-time' },
                      lastUsedAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    [`${basePath}/sessions/{sessionId}`]: {
      delete: {
        tags: ['Auth'],
        summary: 'Revoke a specific session',
        description: 'Revokes a specific session by ID.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'sessionId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '204': { description: 'Session revoked' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Session not found' },
        },
      },
    },
    [`${basePath}/sessions/logout-others`]: {
      delete: {
        tags: ['Auth'],
        summary: 'Logout from all other sessions',
        description: 'Revokes all sessions except the current one.',
        security: [{ BearerAuth: [] }],
        responses: {
          '204': { description: 'Other sessions revoked' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
  });
}
