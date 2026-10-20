import { beforeEach, describe, expect, it } from 'vitest';
import {
  METRIC_PREFIX,
  createCounter,
  createGauge,
  createHistogram,
  evaluateMetricsAccess,
  initProcessMetrics,
  metricName,
  registry,
  renderMetrics,
} from './prometheus.js';

describe('prometheus registry helper (issue #1346)', () => {
  beforeEach(() => {
    registry.clear();
  });

  it('prefixes metric names and rejects names that break the convention', () => {
    expect(metricName('tips_total')).toBe(`${METRIC_PREFIX}tips_total`);
    expect(() => metricName('Tips-Total')).toThrow(/snake_case/);
    expect(() => metricName('tipz_tips_total')).toThrow(/prefix/);
    expect(() => metricName('')).toThrow();
  });

  it('returns the same counter, gauge and histogram on repeated registration', () => {
    const counter = createCounter({ name: 'demo_total', help: 'demo', labelNames: ['kind'] as const });
    expect(createCounter({ name: 'demo_total', help: 'demo', labelNames: ['kind'] as const })).toBe(counter);

    const gauge = createGauge({ name: 'demo_gauge', help: 'demo' });
    expect(createGauge({ name: 'demo_gauge', help: 'demo' })).toBe(gauge);

    const histogram = createHistogram({ name: 'demo_seconds', help: 'demo', buckets: [0.1, 1] });
    expect(createHistogram({ name: 'demo_seconds', help: 'demo', buckets: [0.1, 1] })).toBe(histogram);

    expect(registry.getSingleMetric('tipz_demo_total')).toBe(counter);
  });

  it('renders custom metrics with the process default labels', async () => {
    initProcessMetrics('indexer');
    createCounter({ name: 'demo_total', help: 'demo', labelNames: ['kind'] as const }).inc({ kind: 'a' }, 3);

    const text = await renderMetrics();
    expect(text).toContain('# HELP tipz_demo_total demo');
    expect(text).toContain('# TYPE tipz_demo_total counter');
    expect(text).toMatch(/tipz_demo_total\{[^}]*kind="a"[^}]*\} 3/);
    expect(text).toMatch(/tipz_demo_total\{[^}]*process="indexer"[^}]*\}/);
    expect(text).toMatch(/tipz_demo_total\{[^}]*service="stellar-tipz-backend"[^}]*\}/);
  });

  it('registers the default Node.js process collectors once', async () => {
    initProcessMetrics('api');
    initProcessMetrics('api');

    const text = await renderMetrics();
    for (const name of [
      'process_cpu_seconds_total',
      'process_resident_memory_bytes',
      'nodejs_heap_size_used_bytes',
      'nodejs_eventloop_lag_seconds',
      'nodejs_eventloop_lag_p99_seconds',
      'nodejs_gc_duration_seconds',
    ]) {
      expect(text, name).toContain(`# TYPE ${name}`);
    }
    expect(text.match(/# TYPE process_cpu_seconds_total/g)).toHaveLength(1);
  });

  describe('evaluateMetricsAccess', () => {
    const token = 'scrape-token-with-enough-entropy';

    it('requires the bearer token whenever one is configured', () => {
      const policy = { token, production: false, loopbackBound: true };
      expect(evaluateMetricsAccess(undefined, policy)).toEqual({ allowed: false, status: 401 });
      expect(evaluateMetricsAccess('Bearer nope', policy)).toEqual({ allowed: false, status: 401 });
      expect(evaluateMetricsAccess(`Bearer ${token}x`, policy)).toEqual({ allowed: false, status: 401 });
      expect(evaluateMetricsAccess(`Basic ${token}`, policy)).toEqual({ allowed: false, status: 401 });
      expect(evaluateMetricsAccess(`Bearer ${token}`, policy)).toEqual({ allowed: true });
      expect(evaluateMetricsAccess(`bearer ${token}`, policy)).toEqual({ allowed: true });
    });

    it('stays open without a token outside production', () => {
      expect(evaluateMetricsAccess(undefined, { production: false, loopbackBound: false })).toEqual({ allowed: true });
    });

    it('hides an unauthenticated endpoint on a public interface in production', () => {
      expect(evaluateMetricsAccess(undefined, { production: true, loopbackBound: false })).toEqual({
        allowed: false,
        status: 404,
      });
      expect(evaluateMetricsAccess(undefined, { production: true, loopbackBound: true })).toEqual({ allowed: true });
    });
  });
});
