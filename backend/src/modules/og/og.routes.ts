import { Router } from 'express';
import * as ogController from './og.controller.js';
import { env } from '../../config/env.js';
import { mergeOpenApiPaths, type OpenApiPaths } from '../../docs/openapi.js';

export const ogRouter = Router();

// `.png` suffix is accepted so the URL can be used directly as an OG image src.
ogRouter.get('/creators/:name', ogController.getCreatorOgImage);

const base = `${env.API_BASE_PATH}/og`;

const paths: OpenApiPaths = {
  [`${base}/creators/{username}.png`]: {
    get: {
      tags: ['OG Images'],
      summary: 'Get a creator OG image',
      description:
        'Returns a PNG preview image for a creator profile (name, avatar, credit tier, total tips). Images include an ETag and cache headers for conditional requests. Unknown or errored creators receive a cached default image rather than a broken response.',
      parameters: [
        {
          name: 'username',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Creator username (`.png` suffix optional)',
        },
      ],
      responses: {
        '200': {
          description: 'PNG image',
          content: { 'image/png': { schema: { type: 'string', format: 'binary' } } },
          headers: {
            ETag: { schema: { type: 'string' }, description: 'Content-based entity tag.' },
            'Cache-Control': { schema: { type: 'string' } },
          },
        },
        '304': { description: 'Image has not changed since the cached version.' },
        '400': { description: 'Missing username' },
      },
    },
  },
};

mergeOpenApiPaths(paths);
