import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/common/middleware/rateLimiter.js', () => ({
  globalRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { createApp } from '../src/app.js';
import { openApiDocument } from '../src/docs/openapi.js';

describe('API docs', () => {
  it('serves Swagger UI at /api/v1/docs', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/docs/');
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain('swagger');
  });

  it('serves the OpenAPI spec with the health endpoint', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe(openApiDocument.openapi);
    expect(res.body.paths['/health']).toBeDefined();
    expect(res.body.paths['/health'].get.summary).toBe('Health check');
    expect(res.body.paths['/health/live'].get.summary).toBe('Liveness probe');
    expect(res.body.paths['/health/ready'].get.responses['503']).toBeDefined();
  });
});
