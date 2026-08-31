import express, { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/common/utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock('../src/modules/profiles/profiles.controller.js', () => {
  const handler = (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({ ok: true });
  };

  return {
    listProfilesController: handler,
    getProfileController: handler,
    getProfileByUsernameController: handler,
    getProfileByAddressController: handler,
    updateProfileController: handler,
    deactivateProfileController: handler,
    checkUsernameController: handler,
    reactivateProfileController: handler,
    uploadImageController: handler,
  };
});

import { createVersionedApiRouter, parseVersionedApiBasePath } from '../src/api/versioning.js';
import { requestId } from '../src/common/middleware/requestId.js';
import { logger } from '../src/common/utils/logger.js';
import { profilesRouter } from '../src/modules/profiles/profiles.routes.js';

describe('API versioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves two independently mounted versions concurrently', async () => {
    const v1 = Router().get('/probe', (_req, res) => res.json({ version: 'v1' }));
    const v2 = Router().get('/probe', (_req, res) => res.json({ version: 'v2' }));
    const app = express();
    app.use('/api', createVersionedApiRouter([{ version: 'v1', router: v1 }, { version: 'v2', router: v2 }]));

    const [v1Response, v2Response] = await Promise.all([
      request(app).get('/api/v1/probe'),
      request(app).get('/api/v2/probe'),
    ]);

    expect(v1Response.status).toBe(200);
    expect(v1Response.body).toEqual({ version: 'v1' });
    expect(v2Response.status).toBe(200);
    expect(v2Response.body).toEqual({ version: 'v2' });
  });

  it('derives the stable API root and current version from API_BASE_PATH', () => {
    expect(parseVersionedApiBasePath('/api/v1')).toEqual({ rootPath: '/api', version: 'v1' });
    expect(parseVersionedApiBasePath('/services/tipz/v3/')).toEqual({
      rootPath: '/services/tipz',
      version: 'v3',
    });
  });

  it('adds deprecation metadata and logs identity on the deprecated production endpoint', async () => {
    const app = express();
    app.use(requestId);
    app.use('/api/v1/profiles', profilesRouter);

    const response = await request(app)
      .get('/api/v1/profiles/username/alice')
      .set('X-Client-Id', 'mobile-ios/4.2')
      .set('X-Request-Id', 'request-123');

    expect(response.status).toBe(200);
    expect(response.headers.deprecation).toMatch(/^@\d+$/);
    expect(response.headers.sunset).toBe('Sun, 28 Feb 2027 00:00:00 GMT');
    expect(response.headers.link).toContain('</api/v1/docs>; rel="deprecation"');
    expect(response.headers.link).toContain(
      '</api/v1/profiles/by-username/alice>; rel="successor-version"',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'deprecated_endpoint_used',
        method: 'GET',
        path: '/api/v1/profiles/username/alice',
        requestId: 'request-123',
        client: { type: 'client-id', id: 'mobile-ios/4.2' },
        replacement: '/api/v1/profiles/by-username/alice',
      }),
      'Deprecated API endpoint used',
    );
  });
});
