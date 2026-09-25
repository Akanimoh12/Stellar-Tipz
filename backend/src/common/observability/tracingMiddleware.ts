import type { NextFunction, Request, Response } from 'express';
import { trace, context, propagation, SpanStatusCode } from '@opentelemetry/api';
import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_ROUTE, SEMATTRS_HTTP_STATUS_CODE, SEMATTRS_HTTP_TARGET } from '@opentelemetry/semantic-conventions';
import { getTracer, extractContext, createTraceCarrier, isTracingActive } from './tracing.js';
import { REQUEST_ID_HEADER } from '../middleware/requestId.js';

/**
 * Express middleware that creates a span for each incoming HTTP request.
 * Extracts trace context from incoming headers (W3C traceparent, tracestate)
 * and creates a new span as a child of the extracted context.
 *
 * The trace ID is also exposed on `req.traceId` for log correlation.
 */
export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isTracingActive()) {
    // Tracing not enabled, but still run requestId middleware logic for correlation
    next();
    return;
  }

  const tracer = getTracer();
  if (!tracer) {
    next();
    return;
  }

  // Extract trace context from incoming headers
  const extractedContext = extractContext(req.headers);

  // Get the request ID (from x-request-id header or generated)
  const requestId = req.headers[REQUEST_ID_HEADER];
  const providedRequestId = (Array.isArray(requestId) ? requestId[0] : requestId)?.trim();

  // Start span within the extracted context
  const spanName = `${req.method} ${req.route?.path ?? req.path}`;
  const span = tracer.startSpan(spanName, {
    attributes: {
      [SEMATTRS_HTTP_METHOD]: req.method,
      [SEMATTRS_HTTP_TARGET]: req.originalUrl,
      [SEMATTRS_HTTP_ROUTE]: req.route?.path ?? req.path,
      'http.request_id': providedRequestId ?? 'unknown',
    },
  }, extractedContext);

  // Store trace ID on request for logging correlation
  const traceId = span.spanContext().traceId;
  (req as Request & { traceId?: string }).traceId = traceId;

  // Inject trace context into response headers for downstream services
  const responseCarrier: Record<string, string> = {};
  propagation.inject(trace.setSpan(context.active(), span), responseCarrier);
  for (const [key, value] of Object.entries(responseCarrier)) {
    res.setHeader(key, value);
  }

  // Also echo the request ID
  if (providedRequestId) {
    res.setHeader(REQUEST_ID_HEADER, providedRequestId);
  }

  // Run the rest of the request within the span's context
  context.with(trace.setSpan(context.active(), span), () => {
    // Hook into response finish to end the span
    res.on('finish', () => {
      span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, res.statusCode);
      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
    });

    next();
  });
}