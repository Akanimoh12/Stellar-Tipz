import { EventEmitter } from 'node:events';
import express, { Router, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/redis.js', () => ({ redis: { status: 'ready', info: vi.fn().mockResolvedValue('') } }));
vi.mock('../../db/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  HTTP_DURATION_BUCKETS,
  UNMATCHED_ROUTE,
  httpMetricsMiddleware,
  httpRequestDurationSeconds,
  httpRequestsInFlight,
  httpRequestsTotal,
  inferMountPrefix,
  normalizeMethod,
  resolveRouteLabel,
  statusClass,
} from './httpMetrics.js';
import { getMetrics } from './metrics.js';
import { registry } from './prometheus.js';

type Series = { labels: Record<string, string>; value: number };

async function series(name: string): Promise<Series[]> {
  const metric = (await registry.getMetricsAsJSON()).find((m) => m.name === name);
  return (metric?.values ?? []) as Series[];
}

function buildApp(release?: { promise: Promise<void> }) {
  const app = express();
  app.use(httpMetricsMiddleware);
  const v1 = Router();
  v1.get('/profiles/:username', (req: Request, res: Response) => res.json({ username: req.params.username }));
  v1.post('/tips', (_req: Request, res: Response) => res.status(201).json({ ok: true }));
  v1.get('/boom', () => {
    throw new Error('boom');
  });
  v1.get('/slow', async (_req: Request, res: Response) => {
    await release?.promise;
    res.json({ ok: true });
  });
  app.use('/api/v1', v1);
  const health = Router();
  health.get(['/', '/ready'], (_req: Request, res: Response) => res.json({ status: 'pass' }));
  app.use('/health', health);
  app.use('/docs', (_req: Request, res: Response) => res.send('static'));
  return app;
}

describe('RED HTTP metrics (issue #1347)', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  it('labels requests by route pattern, never by the raw path', async () => {
    const app = buildApp();
    await request(app).get('/api/v1/profiles/alice').expect(200);
    await request(app).get('/api/v1/profiles/bob').expect(200);
    await request(app).get('/api/v1/profiles/G' + 'A'.repeat(55)).expect(200);

    const total = await series('tipz_http_requests_total');
    expect(total).toHaveLength(1);
    expect(total[0].labels).toMatchObject({
      method: 'GET',
      route: '/api/v1/profiles/:username',
      status_code: '200',
      status_class: '2xx',
    });
    expect(total[0].value).toBe(3);
    expect(JSON.stringify(total)).not.toContain('alice');
  });

  it('groups status codes by class alongside the exact code', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/tips').expect(201);
    await request(app).get('/api/v1/boom').expect(500);
    await request(app).get('/nowhere').expect(404);

    const total = await series('tipz_http_requests_total');
    const byCode = Object.fromEntries(total.map((s) => [s.labels.status_code, s.labels]));
    expect(byCode['201']).toMatchObject({ method: 'POST', route: '/api/v1/tips', status_class: '2xx' });
    expect(byCode['500']).toMatchObject({ method: 'GET', route: '/api/v1/boom', status_class: '5xx' });
    expect(byCode['404']).toMatchObject({ method: 'GET', route: UNMATCHED_ROUTE, status_class: '4xx' });
  });

  it('observes a duration histogram per route, method and status class', async () => {
    const app = buildApp();
    await request(app).get('/api/v1/profiles/alice').expect(200);
    await request(app).get('/api/v1/profiles/carol').expect(200);

    const hist = await series('tipz_http_request_duration_seconds');
    const count = hist.find((s) => 'metricName' in s && (s as { metricName?: string }).metricName === 'tipz_http_request_duration_seconds_count');
    expect(count?.labels).toEqual({ method: 'GET', route: '/api/v1/profiles/:username', status_class: '2xx' });
    expect(count?.value).toBe(2);
    const buckets = hist.filter((s) => (s as { metricName?: string }).metricName === 'tipz_http_request_duration_seconds_bucket');
    expect(buckets).toHaveLength(HTTP_DURATION_BUCKETS.length + 1);
  });

  it('collapses array route paths and router mount paths to one label each', async () => {
    const app = buildApp();
    await request(app).get('/health').expect(200);
    await request(app).get('/health/ready').expect(200);
    await request(app).get('/docs/swagger-ui.css').expect(200);

    const routes = (await series('tipz_http_requests_total')).map((s) => [s.labels.route, s.value]);
    expect(routes).toContainEqual(['/health', 2]);
    expect(routes).toContainEqual(['/docs', 1]);
  });

  it('exposes an in-flight gauge that rises during a request and returns to zero', async () => {
    let finish!: () => void;
    const release = { promise: new Promise<void>((resolve) => (finish = resolve)) };
    const app = buildApp(release);

    // supertest is lazy: `.then` starts the request.
    const pending = request(app).get('/api/v1/slow').then((res) => res);
    await vi.waitFor(async () => {
      const inFlight = await series('tipz_http_requests_in_flight');
      expect(inFlight.find((s) => s.labels.method === 'GET')?.value).toBe(1);
    });
    finish();
    expect((await pending).status).toBe(200);

    const inFlight = await series('tipz_http_requests_in_flight');
    expect(inFlight.find((s) => s.labels.method === 'GET')?.value).toBe(0);
  });

  it('keeps the legacy JSON counters in sync', async () => {
    const app = buildApp();
    const before = (await getMetrics()).http;
    await request(app).get('/api/v1/profiles/alice').expect(200);
    await request(app).get('/nowhere').expect(404);
    const after = (await getMetrics()).http;
    expect(after.requests_total - before.requests_total).toBe(2);
    expect(after.requests_errors - before.requests_errors).toBe(1);
  });

  it('bounds the method label and normalises identifier-looking mount segments', () => {
    expect(normalizeMethod('get')).toBe('GET');
    expect(normalizeMethod('PROPFIND')).toBe('OTHER');
    expect(normalizeMethod(undefined)).toBe('OTHER');
    expect(statusClass(204)).toBe('2xx');
    expect(statusClass(499)).toBe('4xx');

    expect(resolveRouteLabel({ baseUrl: '', route: undefined })).toBe(UNMATCHED_ROUTE);
    expect(resolveRouteLabel({ baseUrl: '/users/123e4567-e89b-12d3-a456-426614174000', route: undefined })).toBe('/users/:id');
    expect(resolveRouteLabel({ baseUrl: '/tips/' + 'ab'.repeat(32), route: { path: '/receipt' } })).toBe('/tips/:id/receipt');
    expect(resolveRouteLabel({ baseUrl: '/api/v1', route: { path: /^\/re(gex)$/ } })).toBe('/api/v1/^\\/re(gex)$');
    expect(resolveRouteLabel({ baseUrl: '/api/v1//', route: { path: ['/', '/ready'] } })).toBe('/api/v1');
  });

  it('recovers the mount prefix for responses that finish after the router unwound', () => {
    expect(inferMountPrefix('/api/v1/boom', '/boom')).toBe('/api/v1');
    expect(inferMountPrefix('/api/v1/profiles/alice', '/profiles/:username')).toBe('/api/v1');
    expect(inferMountPrefix('/api/v1/tips/abc123/confirm', '/tips/:txHash/confirm')).toBe('/api/v1');
    expect(inferMountPrefix('/boom', '/boom')).toBe('');
    expect(inferMountPrefix('/health/ready', '/')).toBe('');
    expect(inferMountPrefix('/api/v1/x.y', '/x.y')).toBe('/api/v1');
    expect(resolveRouteLabel({ baseUrl: '', originalUrl: '/api/v1/boom?x=1', route: { path: '/boom' } })).toBe('/api/v1/boom');
  });

  it('adds negligible per-request overhead (measured)', () => {
    const iterations = 20_000;
    const next = () => undefined;
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i += 1) {
      const res = new EventEmitter() as EventEmitter & { headersSent: boolean; statusCode: number };
      res.headersSent = true;
      res.statusCode = 200;
      const req = { method: 'GET', baseUrl: '/api/v1', route: { path: '/profiles/:username' } } as unknown as Request;
      httpMetricsMiddleware(req, res as unknown as Response, next);
      res.emit('finish');
    }
    const microsPerRequest = Number(process.hrtime.bigint() - start) / 1e3 / iterations;
    // Locally ~2-5µs; the bound is loose so slow CI runners never flake. See docs/METRICS.md.
    expect(microsPerRequest).toBeLessThan(150);
    expect(httpRequestsTotal).toBeDefined();
    expect(httpRequestDurationSeconds).toBeDefined();
    expect(httpRequestsInFlight).toBeDefined();
  });
});
