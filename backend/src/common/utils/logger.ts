import pino from 'pino';
import { env } from '../../config/env.js';
import { getTraceId, getSpanId, isTracingActive } from '../../observability/tracing.js';

/** Shared structured logger. Import this everywhere instead of console.log. */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  mixin() {
    const traceId = isTracingActive() ? getTraceId() : undefined;
    const spanId = isTracingActive() ? getSpanId() : undefined;
    const result: Record<string, string> = {};
    if (traceId) result.trace_id = traceId;
    if (spanId) result.span_id = spanId;
    return result;
  },
});
