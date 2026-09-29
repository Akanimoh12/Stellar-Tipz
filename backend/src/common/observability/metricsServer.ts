import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { env } from '../../config/env.js';
import { registerClosable } from '../utils/lifecycle.js';
import { logger } from '../utils/logger.js';
import {
  evaluateMetricsAccess,
  initProcessMetrics,
  metricsContentType,
  renderMetrics,
  type MetricsAccessPolicy,
  type ProcessName,
} from './prometheus.js';

/**
 * Minimal HTTP listener that exposes `GET /metrics` for processes without an
 * Express app (indexer, jobs) and as an internal-interface scrape target for
 * the API (issue #1346). Bound to loopback by default; see docs/METRICS.md.
 */
export interface MetricsServerOptions {
  host: string;
  port: number;
  token?: string;
  production: boolean;
}

export interface MetricsServerHandle {
  server: Server;
  host: string;
  port: number;
  close(): Promise<void>;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

/** Request handler serving only `GET /metrics`; everything else is 404/405. */
export function createMetricsRequestHandler(policy: MetricsAccessPolicy) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? '/').split('?')[0];
    if (path !== '/metrics' && path !== '/metrics/') {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' }).end('method not allowed');
      return;
    }
    const access = evaluateMetricsAccess(req.headers.authorization, policy);
    if (!access.allowed) {
      const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
      if (access.status === 401) headers['WWW-Authenticate'] = 'Bearer';
      res.writeHead(access.status, headers).end(access.status === 401 ? 'unauthorized' : 'not found');
      return;
    }
    try {
      const body = await renderMetrics();
      res.writeHead(200, { 'Content-Type': metricsContentType, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (err) {
      logger.error({ err }, 'Failed to render Prometheus metrics');
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end('metrics unavailable');
    }
  };
}

/**
 * Starts the metrics listener. Resolves to `null` instead of throwing when the
 * port is unavailable: metrics must never take the process down.
 */
export function startMetricsServer(options: MetricsServerOptions): Promise<MetricsServerHandle | null> {
  const loopbackBound = isLoopbackHost(options.host);
  const policy: MetricsAccessPolicy = {
    token: options.token,
    production: options.production,
    loopbackBound,
  };
  const server = createServer((req, res) => {
    void createMetricsRequestHandler(policy)(req, res);
  });

  return new Promise((resolve) => {
    server.once('error', (err) => {
      logger.error({ err, host: options.host, port: options.port }, 'Metrics server failed to start');
      resolve(null);
    });
    server.listen(options.port, options.host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      if (!loopbackBound && !options.token) {
        logger.warn(
          { host: options.host, port },
          'Metrics server is bound to a non-loopback interface without METRICS_BEARER_TOKEN',
        );
      }
      logger.info({ host: options.host, port, protected: Boolean(options.token) }, 'Metrics server listening');
      resolve({
        server,
        host: options.host,
        port,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}

/**
 * Bootstrap helper used by the API, indexer and jobs entry points: registers
 * the process label and default collectors, then starts the internal listener
 * from METRICS_HOST / METRICS_PORT (skipped when METRICS_PORT=0) and hooks it
 * into graceful shutdown.
 */
export async function startProcessMetrics(processName: ProcessName): Promise<MetricsServerHandle | null> {
  initProcessMetrics(processName);
  if (env.METRICS_PORT === 0) return null;
  const handle = await startMetricsServer({
    host: env.METRICS_HOST,
    port: env.METRICS_PORT,
    token: env.METRICS_BEARER_TOKEN,
    production: env.NODE_ENV === 'production',
  });
  if (handle) {
    registerClosable({ name: 'Metrics server', close: handle.close });
  }
  return handle;
}
