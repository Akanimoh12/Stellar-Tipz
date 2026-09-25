/**
 * Shared OpenAPI 3 document for the Stellar Tipz backend.
 *
 * Swagger UI is served from `${API_BASE_PATH}/docs` (see src/app.ts).
 * The raw spec is available at `${API_BASE_PATH}/docs/openapi.json`.
 *
 * ## Adding paths from a feature module
 *
 * When you implement a module, append its routes to this document from the
 * module's routes file (or a colocated `*.openapi.ts`):
 *
 * ```ts
 * import { mergeOpenApiPaths } from '../../docs/openapi.js';
 * import { env } from '../../config/env.js';
 *
 * mergeOpenApiPaths({
 *   [`${env.API_BASE_PATH}/tips`]: {
 *     get: {
 *       tags: ['Tips'],
 *       summary: 'List tips',
 *       responses: { '200': { description: 'OK' } },
 *     },
 *   },
 * });
 * ```
 *
 * Keep path keys aligned with the Express mount path in `src/app.ts`.
 */

export type OpenApiPaths = Record<string, Record<string, unknown>>;

export type OpenApiTag = { name: string; description: string };

export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  paths: OpenApiPaths;
  tags?: OpenApiTag[];
  components?: Record<string, unknown>;
};

/** Base OpenAPI document — extended by feature modules via `mergeOpenApiPaths`. */
export const openApiDocument: OpenApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Stellar Tipz API',
    version: '0.1.0',
    description:
      'Off-chain REST API for Stellar Tipz. Paths are added incrementally as feature modules land.',
  },
  tags: [
    { name: 'Health', description: 'Service liveness and dependency readiness' },
    { name: 'Auth', description: 'Wallet authentication' },
    { name: 'Profiles', description: 'Creator profile management' },
    { name: 'Tips', description: 'On-chain tipping operations' },
    { name: 'Leaderboard', description: 'Creator tip leaderboard with time windows' },
    { name: 'Withdrawals', description: 'Withdrawal operations and balance queries' },
    { name: 'Notifications', description: 'In-app notifications for users' },
    { name: 'Email', description: 'Email notification delivery' },
    { name: 'Privacy', description: 'User privacy export and deletion workflows' },
    { name: 'Moderation', description: 'User abuse reports and moderation intake' },
    { name: 'Search', description: 'Search creators by name or username' },
    { name: 'Analytics', description: 'Platform analytics and daily stats' },
    { name: 'Goals', description: 'Creator funding goals' },
    { name: 'Subscriptions', description: 'Recurring tip subscriptions' },
    { name: 'Streaks', description: 'Tipping streaks' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Backwards-compatible alias for the dependency readiness probe.',
        responses: {
          '200': {
            description: 'All required dependencies are available',
          },
          '503': {
            description: 'At least one required dependency is unavailable',
          },
        },
      },
    },
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Cheap process liveness probe that does not contact external dependencies.',
        responses: {
          '200': {
            description: 'The process is alive',
          },
        },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Checks PostgreSQL, Redis, and Soroban RPC with bounded timeouts.',
        responses: {
          '200': {
            description: 'All required dependencies are available',
          },
          '503': {
            description: 'At least one required dependency is unavailable',
          },
        },
      },
    },
  },
};

/** Merge additional path definitions into the shared OpenAPI document. */
export function mergeOpenApiPaths(paths: OpenApiPaths): void {
  Object.assign(openApiDocument.paths, paths);
}
