import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import './businessMetrics.js';
import './httpMetrics.js';
import './metrics.js';
import { initProcessMetrics, registry } from './prometheus.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../../../observability');

/** Metric names a PromQL expression references, with histogram suffixes folded back to the base name. */
function metricNamesIn(expr: string): string[] {
  const names = new Set<string>();
  for (const match of expr.matchAll(/\b((?:tipz|nodejs|process)_[a-z0-9_]+)\b/g)) {
    names.add(match[1].replace(/_(bucket|sum|count)$/, ''));
  }
  return [...names];
}

/** Metrics a real process exposes: everything registered plus the default collectors. */
function registeredNames(): Set<string> {
  initProcessMetrics('api');
  const names = new Set<string>();
  for (const metric of registry.getMetricsAsArray()) {
    names.add(metric.name);
    // prom-client registers the eventloop lag percentiles as separate gauges; nothing to fold here.
  }
  return names;
}

describe('committed observability assets (issue #1348)', () => {
  const alerts = parse(readFileSync(path.join(assets, 'prometheus/alerts.yml'), 'utf8')) as {
    groups: { name: string; rules: Record<string, unknown>[] }[];
  };
  const dashboard = JSON.parse(readFileSync(path.join(assets, 'grafana/stellar-tipz-platform-health.json'), 'utf8')) as {
    uid: string;
    panels: { type: string; title: string; targets?: { expr: string }[] }[];
  };
  const known = registeredNames();

  it('alert rules are well formed', () => {
    expect(alerts.groups.length).toBeGreaterThanOrEqual(3);
    const names = new Set<string>();
    for (const group of alerts.groups) {
      expect(group.name).toMatch(/^stellar-tipz-/);
      for (const rule of group.rules) {
        expect(rule).toHaveProperty('alert');
        expect(rule).toHaveProperty('expr');
        expect(rule).toHaveProperty('for');
        expect(rule).toHaveProperty(['labels', 'severity']);
        expect(['critical', 'warning']).toContain((rule.labels as { severity: string }).severity);
        expect(rule).toHaveProperty(['annotations', 'summary']);
        expect(rule).toHaveProperty(['annotations', 'description']);
        expect(names.has(rule.alert as string), `duplicate alert ${rule.alert}`).toBe(false);
        names.add(rule.alert as string);
      }
    }
    expect(names).toContain('TipsFlowStopped');
  });

  it('every metric referenced by an alert is emitted by the code', () => {
    for (const group of alerts.groups) {
      for (const rule of group.rules) {
        for (const name of metricNamesIn(rule.expr as string)) {
          expect(known.has(name), `${rule.alert} references unknown metric ${name}`).toBe(true);
        }
      }
    }
  });

  it('business alerts only page on platform-caused failures', () => {
    const business = alerts.groups.find((g) => g.name === 'stellar-tipz-business')!;
    for (const rule of business.rules) {
      expect(rule.expr as string, rule.alert as string).not.toContain('user_error');
    }
  });

  it('the dashboard is valid and every panel query targets an emitted metric', () => {
    expect(dashboard.uid).toBe('stellar-tipz-platform-health');
    const queries = dashboard.panels.filter((p) => p.type !== 'row');
    expect(queries.length).toBeGreaterThanOrEqual(20);
    for (const panel of queries) {
      expect(panel.targets?.length, panel.title).toBeGreaterThan(0);
      for (const target of panel.targets ?? []) {
        const names = metricNamesIn(target.expr);
        expect(names.length, `${panel.title}: ${target.expr}`).toBeGreaterThan(0);
        for (const name of names) {
          expect(known.has(name), `${panel.title} references unknown metric ${name}`).toBe(true);
        }
      }
    }
  });

  it('the dashboard covers every business metric family', () => {
    const allExprs = dashboard.panels.flatMap((p) => (p.targets ?? []).map((t) => t.expr)).join('\n');
    for (const family of [
      'tipz_tips_total',
      'tipz_tip_volume_stroops_total',
      'tipz_withdrawals_total',
      'tipz_registrations_total',
      'tipz_subscription_charges_total',
      'tipz_http_requests_total',
      'tipz_http_request_duration_seconds_bucket',
      'tipz_http_requests_in_flight',
      'nodejs_eventloop_lag_p99_seconds',
    ]) {
      expect(allExprs, family).toContain(family);
    }
  });
});
