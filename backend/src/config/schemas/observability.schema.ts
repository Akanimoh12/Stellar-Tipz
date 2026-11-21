import { z } from 'zod';

export const observabilityEnvSchema = z.object({
  LOG_LEVEL: z.string().default('info'),
  SENTRY_DSN: z.string().optional(),

  // OpenTelemetry Tracing
  OTEL_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  OTEL_SERVICE_NAME: z.string().default('stellar-tipz-backend'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318/v1/traces'),
  OTEL_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  OTEL_PROPAGATION_HEADERS: z.string().default('traceparent,tracestate,x-request-id'),

  // Prometheus metrics
  METRICS_PORT: z.coerce.number().int().min(0).max(65535).default(9464),
  METRICS_HOST: z.string().min(1).default('127.0.0.1'),
  METRICS_BEARER_TOKEN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(16, 'METRICS_BEARER_TOKEN must be at least 16 characters').optional(),
  ),
});

export type ObservabilityEnv = z.infer<typeof observabilityEnvSchema>;
