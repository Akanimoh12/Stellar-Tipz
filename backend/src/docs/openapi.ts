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

export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  paths: OpenApiPaths;
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
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns service liveness status.',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'stellar-tipz-backend' },
                    time: { type: 'string', format: 'date-time' },
                  },
                  required: ['status', 'service', 'time'],
                },
              },
            },
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
