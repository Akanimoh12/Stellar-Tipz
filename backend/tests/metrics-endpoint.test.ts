import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    notificationDelivery: { groupBy: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('../src/db/redis.js', () => ({
  redis: { ping: vi.fn().mockResolvedValue('PONG'), status: 'ready', info: vi.fn().mockResolvedValue('') },
}));

// Redis-backed limiters are replaced by pass-throughs; everything else in the module stays real.
vi.mock('../src/common/middleware/rateLimiter.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/common/middleware/rateLimiter.js')>()),
  globalRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  mutationRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { createApp } from '../src/app.js';
import { initProcessMetrics } from '../src/common/observability/prometheus.js';

describe('GET /metrics through the API (issues #1346, #1347)', () => {
  it('exposes Prometheus text with process and HTTP metrics', async () => {
    // server.ts registers the process collectors before building the app; mirror that here.
    initProcessMetrics('api');
    const app = createApp();
    await request(app).get('/health/live').expect(200);
    await request(app).get('/health/live').expect(200);
    await request(app).get('/definitely-not-a-route').expect(404);

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# TYPE process_cpu_seconds_total counter');
    expect(res.text).toContain('# TYPE nodejs_eventloop_lag_seconds gauge');
    expect(res.text).toMatch(/tipz_http_requests_total\{[^}]*route="\/health\/live"[^}]*status_code="200"[^}]*\} 2/);
    expect(res.text).toMatch(/tipz_http_requests_total\{[^}]*route="unmatched"[^}]*status_code="404"[^}]*\} 1/);
    expect(res.text).toContain('# TYPE tipz_http_request_duration_seconds histogram');
    expect(res.text).toContain('# TYPE tipz_http_requests_in_flight gauge');
    expect(res.text).not.toContain('definitely-not-a-route');
  });

  it('still returns the legacy JSON report for Accept: application/json', async () => {
    const res = await request(createApp()).get('/metrics').set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toMatchObject({ service: 'stellar-tipz-backend' });
    expect(res.body.http.requests_total).toEqual(expect.any(Number));
  });
});
