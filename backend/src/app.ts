import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { createV1Router } from './api/v1.routes.js';
import { createVersionedApiRouter, parseVersionedApiBasePath } from './api/versioning.js';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler.js';
import { globalRateLimiter, mutationRateLimiter } from './common/middleware/rateLimiter.js';
import { metricsController, metricsMiddleware } from './common/observability/metrics.js';
import { getSentryRequestHandler, getSentryErrorHandler } from './common/observability/sentry.js';
import { logger } from './common/utils/logger.js';
import { truncateStellarAddress, truncateEmail, truncateMessage } from './common/utils/logRedaction.js';
import { openApiDocument } from './docs/openapi.js';
import { requestId } from './common/middleware/requestId.js';
import { requestTimeoutAndSignal } from './common/middleware/requestTimeout.js';
import { healthRouter } from './modules/health/health.routes.js';
import { optionalAuth } from './modules/auth/auth.middleware.js';
import { registerGoalsDocs } from './modules/goals/goals.openapi.js';
import { registerSubscriptionsDocs } from './modules/subscriptions/subscriptions.openapi.js';

/**
 * HSTS max-age: 1 year (31536000 seconds).
 */
const HSTS_MAX_AGE_SECONDS = 31536000;

function buildStrictCspDirectives(): Record<string, Iterable<string>> {
  const directives: Record<string, Iterable<string>> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'font-src': ["'self'", 'https:', 'data:'],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'img-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    'script-src': ["'self'"],
    'script-src-attr': ["'none'"],
    'style-src': ["'self'"],
    'upgrade-insecure-requests': [],
  };
  if (env.CSP_REPORT_URI) {
    directives['report-uri'] = [env.CSP_REPORT_URI];
  }
  return directives;
}

function buildDocsCspDirectives(): Record<string, Iterable<string>> {
  const strict = buildStrictCspDirectives();
  return {
    ...strict,
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'", 'https:'],
    'img-src': ["'self'", 'data:', 'https:'],
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

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: strictCspDirectives,
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      originAgentCluster: true,
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: isProduction
        ? {
            maxAge: HSTS_MAX_AGE_SECONDS,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      xContentTypeOptions: true,
      xDnsPrefetchControl: { allow: false },
      xDownloadOptions: true,
      xFrameOptions: { action: 'deny' },
      xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
      hidePoweredBy: true,
      xXssProtection: false,
    }),
  );

  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), fullscreen=(self), interest-cohort=()',
    );
    next();
  });

  const docsMount = `${env.API_BASE_PATH}/docs`;
  app.use(docsMount, helmet.contentSecurityPolicy({ directives: docsCspDirectives }));

  // Serve Swagger UI & raw OpenAPI JSON
  app.get(`${docsMount}/openapi.json`, (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(docsMount, swaggerUi.serve, swaggerUi.setup(openApiDocument));

  const ogMount = `${env.API_BASE_PATH}/og`;
  app.use(ogMount, (_req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    next();
  });
  app.use(ogMount, helmet.contentSecurityPolicy({ directives: { ...strictCspDirectives, 'frame-ancestors': ['*'] } }));

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    }),
  );

  app.use(optionalAuth);
  app.use(globalRateLimiter);
  app.use(mutationRateLimiter);
  app.use(requestId);
  app.use(requestTimeoutAndSignal);
  app.use(metricsMiddleware);
  app.use(express.json({ limit: '1mb' }));

  app.use(
    pinoHttp({
      logger,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'req.headers["x-auth-token"]',
          'req.headers["x-access-token"]',
          'req.headers.bearer',
          'req.body.token',
          'req.body.accessToken',
          'req.body.refreshToken',
          'req.body.apiKey',
          'req.body.privateKey',
          'req.body.secret',
          'req.body.password',
          'res.body.token',
          'res.body.accessToken',
          'res.body.refreshToken',
          'res.body.privateKey',
          'res.body.secret',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req: (req) => {
          const safeBody = req.body ? {
            ...(req.body.username && { username: req.body.username }),
            ...(req.body.email && { email: truncateEmail(req.body.email) }),
            ...(req.body.amount && { amount: req.body.amount }),
            ...(req.body.message && { message: truncateMessage(req.body.message) }),
            ...(req.body.publicKey && { publicKey: truncateStellarAddress(req.body.publicKey) }),
            ...(req.body.recipientAddress && { recipientAddress: truncateStellarAddress(req.body.recipientAddress) }),
            ...(req.body.senderAddress && { senderAddress: truncateStellarAddress(req.body.senderAddress) }),
            _bodyKeys: req.body ? Object.keys(req.body) : [],
          } : undefined;

          return {
            id: req.id,
            method: req.method,
            url: req.url,
            query: req.query,
            params: req.params,
            headers: {
              ...req.headers,
              authorization: req.headers.authorization ? '[REDACTED]' : undefined,
              cookie: req.headers.cookie ? '[REDACTED]' : undefined,
              'x-api-key': req.headers['x-api-key'] ? '[REDACTED]' : undefined,
              'x-auth-token': req.headers['x-auth-token'] ? '[REDACTED]' : undefined,
              'x-access-token': req.headers['x-access-token'] ? '[REDACTED]' : undefined,
            },
            body: safeBody,
            remoteAddress: req.connection?.remoteAddress,
            remotePort: req.connection?.remotePort,
          };
        },
        res: (res) => ({
          statusCode: res.statusCode,
          headers: {
            ...res.getHeaders(),
            'set-cookie': res.getHeaders()['set-cookie'] ? '[REDACTED]' : undefined,
          },
        }),
      },
    }),
  );

  app.get('/metrics', metricsController);

  const cspReportPath = `${env.API_BASE_PATH}/csp-reports`;
  app.post(cspReportPath, (req, res) => {
    logger.warn({ cspReport: req.body, ip: req.ip }, 'CSP violation reported');
    res.status(204).end();
  });

  // Maintainer's versioned router pattern (replaces manual route mounts)
  const { rootPath, version } = parseVersionedApiBasePath(env.API_BASE_PATH);
  app.use(
    rootPath,
    createVersionedApiRouter([{ version, router: createV1Router() }]),
  );

  // Register OpenAPI path docs for feature modules
  registerGoalsDocs();
  registerSubscriptionsDocs();

  app.use(getSentryErrorHandler());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}