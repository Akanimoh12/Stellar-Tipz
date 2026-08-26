import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The global rate limiter awaits Redis; mock it so this integration test is
// hermetic and does not require a running Redis instance.
vi.mock('../src/db/redis.js', () => ({
  redis: {
    zcount: vi.fn(async () => 0),
    zadd: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
  },
}));

import { createApp } from '../src/app.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';

const TIMEOUT = 20000;

describe('CORS middleware (issue #078)', () => {
  it('echoes an allowed origin and enables credentials', async () => {
    const app = createApp();
    const res = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not echo a disallowed origin', async () => {
    const app = createApp();
    const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a preflight with the explicit methods and headers', async () => {
    const app = createApp();
    const res = await request(app)
      .options('/health')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });
});
