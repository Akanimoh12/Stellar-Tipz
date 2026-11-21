import { readFile } from 'node:fs/promises';

const [summaryPath, baselinePath] = process.argv.slice(2);
if (!summaryPath || !baselinePath) {
  throw new Error('Usage: node scripts/compare-load-baseline.mjs <summary.json> <baseline.json>');
}

const [summary, baseline] = await Promise.all(
  [summaryPath, baselinePath].map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
);
const metrics = summary.metrics ?? {};
const value = (metric, field) => metrics[metric]?.values?.[field];
const observed = {
  http_req_failed_rate: value('http_req_failed', 'rate'),
  http_req_duration_p50_ms: value('http_req_duration', 'p(50)'),
  http_req_duration_p95_ms: value('http_req_duration', 'p(95)'),
  http_req_duration_p99_ms: value('http_req_duration', 'p(99)'),
  rpc_failures_rate: value('rpc_failures', 'rate'),
};

const failures = Object.entries(baseline.limits).flatMap(([name, limit]) => {
  const actual = observed[name];
  if (typeof actual !== 'number') return [`${name}: missing from k6 summary`];
  return actual > limit ? [`${name}: ${actual} exceeds ${limit}`] : [];
});

console.table(Object.entries(baseline.limits).map(([name, limit]) => ({
  metric: name,
  actual: observed[name],
  allowed: limit,
  result: observed[name] <= limit ? 'PASS' : 'FAIL',
})));
if (failures.length) throw new Error(`Load-test regression detected:\n${failures.join('\n')}`);
