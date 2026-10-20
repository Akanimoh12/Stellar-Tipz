import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('request id middleware', () => {
  it('attaches a generated x-request-id to every response', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(UUID_RE);
  });

  it('propagates an inbound x-request-id header', async () => {
    const app = createApp();
    const incoming = 'trace-abc-123';
    const res = await request(app).get('/health').set('x-request-id', incoming);

    expect(res.headers['x-request-id']).toBe(incoming);
  });

  it('includes the request id in error responses', async () => {
    const app = createApp();
    const incoming = 'trace-error-456';
    const res = await request(app).get('/does-not-exist').set('x-request-id', incoming);

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe(incoming);
    expect(res.body.error.requestId).toBe(incoming);
  });
});
