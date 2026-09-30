import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { registerClosable } from '../utils/lifecycle.js';
import {
  createMetricsRequestHandler,
  isLoopbackHost,
  startMetricsServer,
  startProcessMetrics,
  type MetricsServerHandle,
} from './metricsServer.js';
import { createCounter, registry } from './prometheus.js';

const TOKEN = 'metrics-token-0123456789abcdef';

function fakeResponse() {
  const res = new EventEmitter() as ServerResponse & { status?: number; headers?: Record<string, string>; body?: string };
  res.writeHead = ((status: number, headers?: Record<string, string>) => {
    res.status = status;
    res.headers = headers ?? {};
    return res;
  }) as ServerResponse['writeHead'];
  res.end = ((body?: string) => {
    res.body = body;
    return res;
  }) as ServerResponse['end'];
  return res;
}

async function handle(policy: Parameters<typeof createMetricsRequestHandler>[0], req: Partial<IncomingMessage>) {
  const res = fakeResponse();
  await createMetricsRequestHandler(policy)({ method: 'GET', url: '/metrics', headers: {}, ...req } as IncomingMessage, res);
  return res;
}

describe('metrics server (issue #1346)', () => {
  let handle1: MetricsServerHandle | null = null;
  let handle2: MetricsServerHandle | null = null;

  beforeEach(() => {
    registry.clear();
  });

  afterEach(async () => {
    await handle1?.close();
    await handle2?.close();
    handle1 = null;
    handle2 = null;
  });

  it('classifies loopback hosts', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('10.0.0.5')).toBe(false);
  });

  it('serves the Prometheus exposition format on GET /metrics and nothing else', async () => {
    createCounter({ name: 'demo_total', help: 'demo' }).inc(2);
    handle1 = await startMetricsServer({ host: '127.0.0.1', port: 0, production: false });
    expect(handle1).not.toBeNull();
    expect(handle1!.port).toBeGreaterThan(0);

    const base = `http://127.0.0.1:${handle1!.port}`;
    const ok = await fetch(`${base}/metrics`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('text/plain');
    expect(ok.headers.get('cache-control')).toBe('no-store');
    const body = await ok.text();
    expect(body).toContain('# HELP tipz_demo_total demo');
    expect(body).toContain('tipz_demo_total 2');

    expect((await fetch(`${base}/metrics?x=1`)).status).toBe(200);
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/health`)).status).toBe(404);
    expect((await fetch(`${base}/metrics`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${base}/metrics`, { method: 'HEAD' })).status).toBe(200);
  });

  it('enforces the bearer token when configured', async () => {
    handle1 = await startMetricsServer({ host: '127.0.0.1', port: 0, production: true, token: TOKEN });
    const url = `http://127.0.0.1:${handle1!.port}/metrics`;

    const denied = await fetch(url);
    expect(denied.status).toBe(401);
    expect(denied.headers.get('www-authenticate')).toBe('Bearer');
    expect((await fetch(url, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await fetch(url, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(200);
  });

  it('hides an unauthenticated public listener in production', async () => {
    const res = await handle({ production: true, loopbackBound: false }, {});
    expect(res.status).toBe(404);
    const loopback = await handle({ production: true, loopbackBound: true }, {});
    expect(loopback.status).toBe(200);
  });

  it('answers 500 instead of crashing when rendering fails', async () => {
    const broken = createCounter({ name: 'broken_total', help: 'broken' });
    vi.spyOn(broken, 'get').mockRejectedValueOnce(new Error('render failed'));
    const res = await handle({ production: false, loopbackBound: true }, {});
    expect(res.status).toBe(500);
  });

  it('resolves null instead of throwing when the port is taken', async () => {
    handle1 = await startMetricsServer({ host: '127.0.0.1', port: 0, production: false });
    handle2 = await startMetricsServer({ host: '127.0.0.1', port: handle1!.port, production: false });
    expect(handle2).toBeNull();
  });

  it('stops accepting connections after close', async () => {
    const handle3 = await startMetricsServer({ host: '127.0.0.1', port: 0, production: false });
    const url = `http://127.0.0.1:${handle3!.port}/metrics`;
    expect((await fetch(url)).status).toBe(200);
    await handle3!.close();
    await expect(fetch(url)).rejects.toThrow();
  });

  it('startProcessMetrics registers default collectors and skips the listener when METRICS_PORT=0', async () => {
    const registrations = vi.mocked(registerClosable);
    const result = await startProcessMetrics('jobs');
    expect(result).toBeNull();
    expect(registry.getSingleMetric('process_cpu_seconds_total')).toBeDefined();
    expect(registrations).not.toHaveBeenCalled();
  });
});

vi.mock('../utils/lifecycle.js', () => ({ registerClosable: vi.fn() }));
