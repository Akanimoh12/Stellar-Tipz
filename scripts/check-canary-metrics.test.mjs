import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

async function runProbe(values, overrides = {}) {
  const server = createServer((req, res) => {
    const query = new URL(req.url, 'http://localhost').searchParams.get('query');
    const value = values[query];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      status: 'success',
      data: { result: value === undefined ? [] : [{ value: [1, String(value)] }] },
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const env = {
      ...process.env,
      PROMETHEUS_URL: 'http://127.0.0.1:' + server.address().port,
      BASELINE_ERROR_QUERY: 'stable-errors',
      CANARY_ERROR_QUERY: 'canary-errors',
      BASELINE_LATENCY_QUERY: 'stable-latency',
      CANARY_LATENCY_QUERY: 'canary-latency',
      PROMETHEUS_TOKEN: '',
      ...overrides,
    };
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/check-canary-metrics.mjs'], { env });
      let output = '';
      child.stdout.on('data', (data) => { output += data; });
      child.stderr.on('data', (data) => { output += data; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output }));
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const baseline = {
  'stable-errors': 0.02,
  'canary-errors': 0.025,
  'stable-latency': 0.2,
  'canary-latency': 0.22,
};

test('promotes when error and p95 latency remain within gate', async () => {
  const result = await runProbe(baseline);
  assert.equal(result.code, 0, result.output);
});

test('blocks on increased error rate', async () => {
  const result = await runProbe({ ...baseline, 'canary-errors': 0.06 });
  assert.equal(result.code, 1);
  assert.match(result.output, /"errorPass":false/);
});

test('blocks on slow canary', async () => {
  const result = await runProbe({ ...baseline, 'canary-latency': 0.5 });
  assert.equal(result.code, 1);
  assert.match(result.output, /"latencyPass":false/);
});

test('fails closed on missing canary samples', async () => {
  const { 'canary-errors': ignored, ...missing } = baseline;
  const result = await runProbe(missing);
  assert.equal(result.code, 1);
  assert.match(result.output, /Expected exactly one/);
});

test('fails closed on invalid threshold configuration', async () => {
  const result = await runProbe(baseline, { MAX_LATENCY_RATIO: '0.5' });
  assert.notEqual(result.code, 0);
});
