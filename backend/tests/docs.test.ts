import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openApiDocument } from '../src/docs/openapi.js';
import { env } from '../src/config/env.js';

describe('API docs', () => {
  it('serves Swagger UI at /api/docs', async () => {
    const app = createApp();
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain('swagger');
  });

  it('serves the OpenAPI spec with the health endpoint', async () => {
    const app = createApp();
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe(openApiDocument.openapi);
    expect(res.body.paths['/health']).toBeDefined();
    expect(res.body.paths['/health'].get.summary).toBe('Health check');
  });
});
