import type { Prisma } from '@prisma/client';
import { SpanStatusCode } from '@opentelemetry/api';
import { SEMATTRS_DB_SYSTEM, SEMATTRS_DB_OPERATION, SEMATTRS_DB_STATEMENT, SEMATTRS_DB_NAME } from '@opentelemetry/semantic-conventions';
import { getTracer, addSpanAttributes, isTracingActive, withSpanSync } from './tracing.js';

let prismaMiddlewareRegistered = false;

/**
 * Creates a Prisma middleware that instruments database queries with OpenTelemetry spans.
 * Each query gets a span with attributes for the model, operation, and (optionally) the query.
 */
export function createPrismaTracingMiddleware(): Prisma.Middleware {
  return async function prismaTracingMiddleware(
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
  ): Promise<unknown> {
    if (!isTracingActive()) {
      return next(params);
    }

    const tracer = getTracer();
    if (!tracer) {
      return next(params);
    }

    const model = params.model ?? 'unknown';
    const operation = params.action;
    const spanName = `db.${model}.${operation}`;

    return withSpanSync(
      spanName,
      (span) => {
        span.setAttributes({
          [SEMATTRS_DB_SYSTEM]: 'postgresql',
          [SEMATTRS_DB_OPERATION]: operation,
          [SEMATTRS_DB_NAME]: 'stellar_tipz',
          'db.prisma.model': model,
        });

        // Note: We intentionally do NOT log the query args (params.args) as they
        // may contain PII (wallet addresses, emails, messages, etc.)

        const startTime = Date.now();
        try {
          const result = next(params);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          span.recordException(err as Error);
          throw err;
        } finally {
          const durationMs = Date.now() - startTime;
          span.setAttribute('db.duration_ms', durationMs);
        }
      },
      { kind: 2 }, // SpanKind.CLIENT
    );
  };
}

/**
 * Registers the Prisma tracing middleware on a Prisma client instance.
 * Call this once during application startup.
 */
export function registerPrismaTracing(prismaClient: Prisma.Client): void {
  if (prismaMiddlewareRegistered) {
    return;
  }
  prismaClient.$use(createPrismaTracingMiddleware());
  prismaMiddlewareRegistered = true;
}