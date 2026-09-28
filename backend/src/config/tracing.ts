import { env } from './env.js';

export interface TracingConfig {
  serviceName: string;
  enabled: boolean;
  otlpEndpoint: string;
  sampleRate: number;
  propagationHeaders: string[];
}

export function getTracingConfig(): TracingConfig {
  return {
    serviceName: env.OTEL_SERVICE_NAME ?? 'stellar-tipz-backend',
    enabled: env.OTEL_ENABLED ?? true,
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
    sampleRate: env.OTEL_SAMPLE_RATE ?? 0.1,
    propagationHeaders: ['traceparent', 'tracestate', 'x-request-id'],
  };
}

export function isTracingEnabled(): boolean {
  return getTracingConfig().enabled && env.NODE_ENV !== 'test';
}