import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { createV1Router } from './api/v1.routes.js';
import { createVersionedApiRouter, parseVersionedApiBasePath } from './api/versioning.js';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler.js';
import { globalRateLimiter } from './common/middleware/rateLimiter.js';
import { metricsController, metricsMiddleware } from './common/observability/metrics.js';
import { getSentryRequestHandler, getSentryErrorHandler } from './common/observability/sentry.js';
import { logger } from './common/utils/logger.js';
import { requestId } from './common/middleware/requestId.js';
import { healthRouter } from './modules/health/health.routes.js';

/**
 * HSTS max-age: 1 year (31536000 seconds).
 * This is the recommended minimum for HSTS preload inclusion and is
 * explicitly documented so a future helmet upgrade that changes the default
 * is caught by tests. Only enabled in production to avoid breaking http
 * in dev/test (see helmet config below).
 */
const HSTS_MAX_AGE_SECONDS = 31536000; // 1 year

/**
 * Strict CSP for the JSON API — no inline scripts or styles are needed
 * because API responses are JSON, not HTML. `script-src 'self'` with NO
 * `unsafe-inline` is the whole point of CSP for XSS mitigation (issue #079).
 *
 * Swagger UI at /api/v1/docs is the ONLY place that needs inline code;
 * it gets a scoped relaxation via `docsCspDirectives` below. That exception
 * is documented and limited to the docs route — the pragmatic fix per guidance.
 */
function buildStrictCspDirectives(): Record<string, Iterable<string>> {
  const directives: Record<string, Iterable<string>> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'font-src': ["'self'", 'https:', 'data:'],
    'form-action': ["'self'"],
    // API must not be framed — prevents clickjacking. The OG/embed route
    // overrides this to allow framing (see #066 handling below).
    'frame-ancestors': ["'none'"],
    'img-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    // No unsafe-inline — API has no inline scripts
    'script-src': ["'self'"],
    'script-src-attr': ["'none'"],
    // No unsafe-inline for styles either — API is JSON
    'style-src': ["'self'"],
    'upgrade-insecure-requests': [],
  };
  if (env.CSP_REPORT_URI) {
    directives['report-uri'] = [env.CSP_REPORT_URI];
  }
  return directives;
}

/**
 * Relaxed CSP for Swagger UI — Swagger's inline scripts/styles require
 * `unsafe-inline`. This is scoped ONLY to /api/v1/docs (and its subpaths)
 * via a route-specific helmet override. The relaxation is documented here
 * because Swagger UI cannot run without inline code and the alternative
 * (nonces/hashes) would require patching swagger-ui-express internals.
 */
function buildDocsCspDirectives(): Record<string, Iterable<string>> {
  const strict = buildStrictCspDirectives();
  return {
    ...strict,
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'", 'https:'],
    'img-src': ["'self'", 'data:', 'https:'],
    // Docs may be framed by self for preview; keep strict for others
    'frame-ancestors': ["'self'"],
  };
}

/** Builds and configures the Express application without starting a listener. */
export function createApp(): Express {
  const app = express();

  // Probes must remain reachable even when Redis-backed middleware is unavailable.
  app.use('/health', healthRouter);

  app.use(getSentryRequestHandler());

  const isProduction = env.NODE_ENV === 'production';
  const strictCspDirectives = buildStrictCspDirectives();
  const docsCspDirectives = buildDocsCspDirectives();

  // Explicit helmet configuration — every header is set intentionally so a
  // dependency bump that drops or changes a default breaks the security
  // header tests rather than silently weakening policy.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: strictCspDirectives,
      },
      // Cross-Origin policies — explicit even when disabled
      crossOriginEmbedderPolicy: false, // No cross-origin isolation needed for JSON API
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      originAgentCluster: true,
      referrerPolicy: { policy: 'no-referrer' }, // Explicit: do not leak referrer
      strictTransportSecurity: isProduction
        ? {
            maxAge: HSTS_MAX_AGE_SECONDS,
            includeSubDomains: true,
            preload: true,
          }
        : false, // HSTS only in production — http in dev/test would break
      xContentTypeOptions: true, // X-Content-Type-Options: nosniff
      xDnsPrefetchControl: { allow: false }, // X-DNS-Prefetch-Control: off
      xDownloadOptions: true, // X-Download-Options: noopen
      xFrameOptions: { action: 'deny' }, // X-Frame-Options: DENY (embed route overrides)
      xPermittedCrossDomainPolicies: { permittedPolicies: 'none' }, // X-Permitted-Cross-Domain-Policies: none
      hidePoweredBy: true, // Remove X-Powered-By
      xXssProtection: false, // Disable deprecated X-XSS-Protection
    }),
  );

  // Permissions-Policy: deny unused browser features. Helmet v7 does not set
  // this header, so we add it explicitly. The test asserts the exact value so
  // a missing permission is a failing build.
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), fullscreen=(self), interest-cohort=()',
    );
    next();
  });

  // Scoped relaxed CSP for Swagger UI — must run AFTER global helmet so it
  // overwrites the strict policy only for /docs. This is the documented
  // exception: Swagger UI needs unsafe-inline for its inline scripts/styles.
  const docsMount = `${env.API_BASE_PATH}/docs`;
  app.use(docsMount, helmet.contentSecurityPolicy({ directives: docsCspDirectives }));

  // Embeddable route (#066) — OG images are designed to be embedded in
  // <img> and <iframe> contexts on third-party sites, so they need a
  // permissive frame policy. We remove the global DENY and set a permissive
  // CSP frame-ancestors. This middleware runs after global helmet and before
  // the versioned router, so only /og/* gets the relaxed frame policy.
  const ogMount = `${env.API_BASE_PATH}/og`;
  app.use(ogMount, (_req, res, next) => {
    // Remove DENY so the route can be framed; CSP frame-ancestors governs modern browsers.
    res.removeHeader('X-Frame-Options');
    // Set X-Frame-Options to allow embedding — use "ALLOWALL" via CSP, but for
    // legacy browsers we explicitly set a permissive value; the header test
    // expects this route to NOT be DENY.
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    next();
  });
  app.use(ogMount, helmet.contentSecurityPolicy({ directives: { ...strictCspDirectives, 'frame-ancestors': ['*'] } }));
  app.use(
    cors({
      // env.CORS_ORIGIN is already validated as a list of absolute origins at
      // startup (see config/cors.ts), so a misconfigured origin never reaches
      // request time.
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    }),
  );
  app.use(globalRateLimiter);
  app.use(requestId);
  app.use(metricsMiddleware);
  // Must parse both JSON and CSP report bodies (browsers send application/csp-report)
  app.use(express.json({ limit: '1mb', type: ['application/json', 'application/csp-report'] }));
  app.use(pinoHttp({ logger }));

  app.get('/metrics', metricsController);

  // CSP violation reporting endpoint — configurable via CSP_REPORT_URI.
  // Browsers POST JSON reports here when CSP is violated. We log the report
  // as a security event for monitoring. No auth required.
  const cspReportPath = `${env.API_BASE_PATH}/csp-reports`;
  app.post(cspReportPath, (req, res) => {
    logger.warn({ cspReport: req.body, ip: req.ip }, 'CSP violation reported');
    res.status(204).end();
  });

  const { rootPath, version } = parseVersionedApiBasePath(env.API_BASE_PATH);
  app.use(
    rootPath,
    createVersionedApiRouter([{ version, router: createV1Router() }]),
  );

  app.use(getSentryErrorHandler());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
