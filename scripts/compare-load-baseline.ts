import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// npm invokes this utility from backend/ so that the existing tsx dependency is available.
const repositoryRoot = resolve(process.cwd(), '..');

type Metric = { values?: Record<string, number> };
type Summary = { metrics?: Record<string, Metric> };
type Baseline = { limits: Record<string, number> };

async function main(): Promise<void> {
const [summaryPath, baselinePath] = process.argv.slice(2);
if (!summaryPath || !baselinePath) {
  throw new Error('Usage: npm run load:compare -- <summary.json> <baseline.json>');
}
const [summary, baseline] = await Promise.all([
  readFile(resolve(repositoryRoot, summaryPath), 'utf8').then((data) => JSON.parse(data) as Summary),
  readFile(resolve(repositoryRoot, baselinePath), 'utf8').then((data) => JSON.parse(data) as Baseline),
]);
if (!baseline.limits || typeof baseline.limits !== 'object') {
  throw new Error('Baseline must contain numeric limits');
}
const metrics = summary.metrics ?? {};
const value = (metric: string, field: string): number | undefined => metrics[metric]?.values?.[field];
const observed: Record<string, number | undefined> = {
  http_req_failed_rate: value('http_req_failed', 'rate'),
  http_req_duration_p50_ms: value('http_req_duration', 'p(50)'),
  http_req_duration_p95_ms: value('http_req_duration', 'p(95)'),
  http_req_duration_p99_ms: value('http_req_duration', 'p(99)'),
  rpc_failures_rate: value('rpc_failures', 'rate'),
};
const failures = Object.entries(baseline.limits).flatMap(([name, limit]) => {
  const actual = observed[name];
  if (typeof actual !== 'number' || !Number.isFinite(actual)) return [`${name}: missing or invalid k6 metric`];
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return [`${name}: invalid baseline limit`];
  return actual > limit ? [`${name}: ${actual} exceeds ${limit}`] : [];
});
console.table(Object.entries(baseline.limits).map(([name, limit]) => ({
  metric: name,
  actual: observed[name],
  allowed: limit,
  result: typeof observed[name] === 'number' && Number.isFinite(observed[name]) && observed[name]! <= limit ? 'PASS' : 'FAIL',
})));
if (failures.length) throw new Error(`Load-test regression detected:\n${failures.join('\n')}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
