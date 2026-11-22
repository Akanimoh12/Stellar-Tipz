import { timingSafeEqual } from 'node:crypto';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type CounterConfiguration,
  type GaugeConfiguration,
  type HistogramConfiguration,
} from 'prom-client';

/**
 * Prometheus registry shared by every module in a process (issue #1346).
 *
 * All custom metrics go through {@link createCounter}, {@link createGauge} or
 * {@link createHistogram} so they share one registry, one name prefix and one
 * set of default labels. Default process metrics (CPU, memory, event loop lag,
 * GC) are registered by {@link initProcessMetrics} at bootstrap.
 *
 * Naming follows the Prometheus conventions documented in docs/METRICS.md:
 * `tipz_<subsystem>_<quantity>_<unit>`, `_total` suffix for counters, base
 * units (seconds, bytes, stroops) and snake_case labels.
 */
export const METRIC_PREFIX = 'tipz_';

export type ProcessName = 'api' | 'indexer' | 'jobs';

export const registry = new Registry();

const METRIC_NAME = /^[a-z][a-z0-9_]*$/;

/** Sentinel default metric used to detect whether default collectors are already registered. */
const DEFAULT_METRIC_SENTINEL = 'process_cpu_seconds_total';

/**
 * Attaches the process label and starts the default Node.js collectors.
 * Idempotent: calling it twice (or after `registry.clear()` in tests) is safe.
 */
export function initProcessMetrics(processName: ProcessName): void {
  registry.setDefaultLabels({ service: 'stellar-tipz-backend', process: processName });
  if (!registry.getSingleMetric(DEFAULT_METRIC_SENTINEL)) {
    collectDefaultMetrics({ register: registry, eventLoopMonitoringPrecision: 10 });
  }
}

/** Resolves the full metric name and rejects names that break the naming convention. */
export function metricName(name: string): string {
  if (!METRIC_NAME.test(name)) {
    throw new Error(`Invalid metric name "${name}": use snake_case letters, digits and underscores`);
  }
  if (name.startsWith(METRIC_PREFIX)) {
    throw new Error(`Metric name "${name}" must not include the "${METRIC_PREFIX}" prefix; it is added automatically`);
  }
  return `${METRIC_PREFIX}${name}`;
}

type Spec<T extends string> = { name: string; help: string; labelNames?: readonly T[] };

/** Returns the registered counter for `spec.name`, creating it on first use. */
export function createCounter<T extends string = string>(spec: Spec<T>): Counter<T> {
  const name = metricName(spec.name);
  const existing = registry.getSingleMetric(name);
  if (existing) return existing as Counter<T>;
  const config: CounterConfiguration<T> = {
    name,
    help: spec.help,
    labelNames: [...(spec.labelNames ?? [])],
    registers: [registry],
  };
  return new Counter<T>(config);
}

/** Returns the registered gauge for `spec.name`, creating it on first use. */
export function createGauge<T extends string = string>(
  spec: Spec<T> & { collect?: GaugeConfiguration<T>['collect'] },
): Gauge<T> {
  const name = metricName(spec.name);
  const existing = registry.getSingleMetric(name);
  if (existing) return existing as Gauge<T>;
  const config: GaugeConfiguration<T> = {
    name,
    help: spec.help,
    labelNames: [...(spec.labelNames ?? [])],
    registers: [registry],
    collect: spec.collect,
  };
  return new Gauge<T>(config);
}

/** Returns the registered histogram for `spec.name`, creating it on first use. */
export function createHistogram<T extends string = string>(
  spec: Spec<T> & { buckets: readonly number[] },
): Histogram<T> {
  const name = metricName(spec.name);
  const existing = registry.getSingleMetric(name);
  if (existing) return existing as Histogram<T>;
  const config: HistogramConfiguration<T> = {
    name,
    help: spec.help,
    labelNames: [...(spec.labelNames ?? [])],
    buckets: [...spec.buckets],
    registers: [registry],
  };
  return new Histogram<T>(config);
}

/** Serialises every registered metric in the Prometheus text exposition format. */
export function renderMetrics(): Promise<string> {
  return registry.metrics();
}

export const metricsContentType: string = registry.contentType;

export interface MetricsAccessPolicy {
  /** When set, requests must carry `Authorization: Bearer <token>`. */
  token?: string;
  /** In production an unauthenticated endpoint is only allowed on a loopback interface. */
  production: boolean;
  /** True when the listener is bound to 127.0.0.1 / ::1 / localhost. */
  loopbackBound: boolean;
}

export type MetricsAccess = { allowed: true } | { allowed: false; status: 401 | 404 };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Decides whether a scrape request may read the registry.
 *
 * - A configured bearer token is always enforced (constant-time comparison).
 * - Without a token the endpoint stays open in development and test, and in
 *   production only when it is bound to a loopback interface; otherwise it is
 *   hidden (404) so a public API port never leaks operational data.
 */
export function evaluateMetricsAccess(
  authorization: string | undefined,
  policy: MetricsAccessPolicy,
): MetricsAccess {
  if (policy.token) {
    const presented = authorization?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];
    if (!presented || !safeEqual(presented, policy.token)) {
      return { allowed: false, status: 401 };
    }
    return { allowed: true };
  }
  if (policy.production && !policy.loopbackBound) {
    return { allowed: false, status: 404 };
  }
  return { allowed: true };
}
