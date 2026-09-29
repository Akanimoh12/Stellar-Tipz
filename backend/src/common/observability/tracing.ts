import { context, propagation, trace, SpanStatusCode, type Span, type Tracer, type SpanOptions } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { getTracingConfig, isTracingEnabled } from '@/config/tracing.js';
import { logger } from '../utils/logger.js';

let tracerProvider: NodeTracerProvider | null = null;
let tracer: Tracer | null = null;
let initialized = false;

/**
 * Initialize OpenTelemetry tracing.
 * Call once at application startup.
 */
export function initTracing(): void {
  if (initialized) {
    logger.warn('Tracing already initialized, skipping');
    return;
  }

  if (!isTracingEnabled()) {
    logger.info('Tracing disabled via configuration');
    initialized = true;
    return;
  }

  const config = getTracingConfig();

  try {
    tracerProvider = new NodeTracerProvider({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: config.serviceName,
      }),
      sampler: new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(config.sampleRate),
      }),
    });

    const exporter = new OTLPTraceExporter({
      url: config.otlpEndpoint,
    });

    tracerProvider.addSpanProcessor(new BatchSpanProcessor(exporter));
    tracerProvider.register({
      propagator: new propagation.CompositePropagator({
        propagators: [
          new propagation.W3CTraceContextPropagator(),
          new propagation.W3CBaggagePropagator(),
        ],
      }),
    });

    tracer = tracerProvider.getTracer(config.serviceName);
    initialized = true;
    logger.info({ serviceName: config.serviceName, endpoint: config.otlpEndpoint, sampleRate: config.sampleRate }, 'OpenTelemetry tracing initialized');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize OpenTelemetry tracing');
    initialized = true;
  }
}

/**
 * Get the tracer instance. Returns undefined if tracing is not initialized.
 */
export function getTracer(): Tracer | undefined {
  return tracer;
}

/**
 * Get the current active span from context.
 */
export function getActiveSpan(): Span | undefined {
  return trace.getSpan(context.active());
}

/**
 * Get the current trace ID, or undefined if no span is active.
 */
export function getTraceId(): string | undefined {
  const span = getActiveSpan();
  return span?.spanContext().traceId;
}

/**
 * Get the current span ID, or undefined if no span is active.
 */
export function getSpanId(): string | undefined {
  const span = getActiveSpan();
  return span?.spanContext().spanId;
}

/**
 * Run a function within a new span.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options: SpanOptions = {},
): Promise<T> {
  if (!tracer) {
    return fn({} as Span);
  }

  return tracer.startActiveSpan(name, options, async (span) => {
    try {
      const result = await fn(span);
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
      span.end();
    }
  });
}

/**
 * Run a synchronous function within a new span.
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options: SpanOptions = {},
): T {
  if (!tracer) {
    return fn({} as Span);
  }

  const span = tracer.startSpan(name, options);
  try {
    const result = fn(span);
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
    span.end();
  }
}

/**
 * Add attributes to the current active span.
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Add an event to the current active span.
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Extract trace context from carrier (e.g., HTTP headers).
 */
export function extractContext(carrier: Record<string, string | string[] | undefined>): context.Context {
  return propagation.extract(context.active(), carrier);
}

/**
 * Inject trace context into carrier (e.g., HTTP headers, job payload).
 */
export function injectContext(carrier: Record<string, string>): void {
  propagation.inject(context.active(), carrier);
}

/**
 * Create a carrier object with the current trace context injected.
 * Useful for passing trace context in job payloads or outbound HTTP requests.
 */
export function createTraceCarrier(): Record<string, string> {
  const carrier: Record<string, string> = {};
  injectContext(carrier);
  return carrier;
}

/**
 * Run a function with a specific trace context.
 */
export function withContext<T>(ctx: context.Context, fn: () => T): T {
  return context.with(ctx, fn);
}

/**
 * Check if tracing is initialized and enabled.
 */
export function isTracingActive(): boolean {
  return initialized && !!tracer;
}

/**
 * Gracefully shutdown the tracer provider.
 */
export async function shutdownTracing(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    tracerProvider = null;
    tracer = null;
    initialized = false;
    logger.info('OpenTelemetry tracing shut down');
  }
}

export { trace, context, propagation, SpanStatusCode };