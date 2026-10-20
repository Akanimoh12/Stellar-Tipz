import type { NextFunction, Request, Response } from 'express';
import { recordError, recordRequest } from './metrics.js';
import { createCounter, createGauge, createHistogram } from './prometheus.js';

/**
 * RED metrics (Rate, Errors, Duration) for every HTTP endpoint (issue #1347).
 *
 * Routes are labelled by their Express pattern (`/api/v1/profiles/:username`),
 * never by the raw path, so the number of time series is bounded by the route
 * table rather than by the number of users. Unmatched requests share one
 * `unmatched` label. Measured overhead is documented in docs/METRICS.md.
 */
export const UNMATCHED_ROUTE = 'unmatched';

const KNOWN_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

/** Seconds; tuned for an API whose p99 target is well under a second. */
export const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

/** Segments that look like identifiers. Defence in depth for mount paths that carry params. */
const DYNAMIC_SEGMENT_PATTERNS = [
  /^[0-9a-f]{64}$/i, // transaction hash
  /^[GC][A-Z2-7]{55}$/, // Stellar account / contract id
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // uuid
  /^c[a-z0-9]{24}$/, // cuid
  /^\d+$/, // numeric id
];

export const httpRequestsTotal = createCounter({
  name: 'http_requests_total',
  help: 'HTTP requests handled, by method, route pattern and response status',
  labelNames: ['method', 'route', 'status_code', 'status_class'] as const,
});

export const httpRequestDurationSeconds = createHistogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds, by method, route pattern and status class',
  labelNames: ['method', 'route', 'status_class'] as const,
  buckets: HTTP_DURATION_BUCKETS,
});

export const httpRequestsInFlight = createGauge({
  name: 'http_requests_in_flight',
  help: 'HTTP requests currently being handled, by method',
  labelNames: ['method'] as const,
});

export function normalizeMethod(method: string | undefined): string {
  const upper = (method ?? '').toUpperCase();
  return KNOWN_METHODS.has(upper) ? upper : 'OTHER';
}

function collapsePath(path: string): string {
  const collapsed = path.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/$/, '') : collapsed;
}

function normalizeDynamicSegments(path: string): string {
  return path
    .split('/')
    .map((segment) => (DYNAMIC_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment)) ? ':id' : segment))
    .join('/');
}

const leafPatternCache = new Map<string, RegExp>();

/** Compiles an Express-style leaf path (`/tips/:txHash/confirm`) into a full-match regexp. */
function leafPattern(leaf: string): RegExp {
  let pattern = leafPatternCache.get(leaf);
  if (!pattern) {
    const source = leaf
      .split('/')
      .map((segment) =>
        segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('/');
    pattern = new RegExp(`^${source}/?$`);
    leafPatternCache.set(leaf, pattern);
  }
  return pattern;
}

/**
 * Express restores `req.baseUrl` while unwinding a mounted router, so an error
 * response finishes with the mount prefix gone. Recover it by finding the
 * shortest prefix of the original path after which the leaf pattern matches.
 */
export function inferMountPrefix(originalPath: string, leaf: string): string {
  const pattern = leafPattern(leaf);
  const segments = originalPath.split('/');
  for (let i = 0; i < segments.length; i += 1) {
    const prefix = segments.slice(0, i).join('/');
    if (pattern.test(originalPath.slice(prefix.length))) return prefix;
  }
  return '';
}

/**
 * Builds the route label from the matched Express route pattern. Falls back to
 * the router mount path (for `router.use` handlers such as Swagger UI) and to
 * `unmatched` when nothing matched (404s), keeping label cardinality bounded.
 */
export function resolveRouteLabel(
  req: Pick<Request, 'baseUrl'> & { route?: { path?: unknown }; originalUrl?: string },
): string {
  const routePath = req.route?.path;
  const leaf = Array.isArray(routePath)
    ? routePath[0]
    : typeof routePath === 'string'
      ? routePath
      : routePath instanceof RegExp
        ? routePath.source
        : undefined;
  let base = req.baseUrl ?? '';
  if (leaf === undefined) {
    return base ? normalizeDynamicSegments(collapsePath(base)) : UNMATCHED_ROUTE;
  }
  if (base === '' && typeof leaf === 'string' && typeof req.originalUrl === 'string') {
    base = inferMountPrefix(req.originalUrl.split('?')[0], leaf);
  }
  return normalizeDynamicSegments(collapsePath(`${base}/${String(leaf)}`));
}

export function statusClass(statusCode: number): string {
  return `${Math.floor(statusCode / 100)}xx`;
}

/** Express middleware recording RED metrics for the request once it finishes or the socket closes. */
export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = normalizeMethod(req.method);
  const start = process.hrtime.bigint();
  httpRequestsInFlight.inc({ method });

  let recorded = false;
  const record = (): void => {
    if (recorded) return;
    recorded = true;
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    // A socket closed before the response was sent has no meaningful status; use 499 (client closed request).
    const code = res.headersSent ? res.statusCode : 499;
    const route = resolveRouteLabel(req);
    const labels = { method, route, status_class: statusClass(code) };
    httpRequestsTotal.inc({ ...labels, status_code: String(code) });
    httpRequestDurationSeconds.observe(labels, seconds);
    httpRequestsInFlight.dec({ method });
    recordRequest(seconds * 1000);
    if (code >= 400) recordError();
  };

  res.once('finish', record);
  res.once('close', record);
  next();
}
