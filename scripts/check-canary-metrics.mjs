#!/usr/bin/env node
// Fail-closed comparison of canary and stable Prometheus metrics.
// Queries must select equivalent windows and use deployment-specific labels.
const required = ['PROMETHEUS_URL', 'BASELINE_ERROR_QUERY', 'CANARY_ERROR_QUERY', 'BASELINE_LATENCY_QUERY', 'CANARY_LATENCY_QUERY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error('Missing canary metric configuration:', missing.join(', '));
  process.exitCode = 2;
} else {
  const base = new URL(process.env.PROMETHEUS_URL);
  if (base.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(base.hostname)) {
    throw new Error('PROMETHEUS_URL must be HTTPS except for local testing');
  }
  async function query(expression) {
    const url = new URL('/api/v1/query', base);
    url.searchParams.set('query', expression);
    const response = await fetch(url, {
      headers: process.env.PROMETHEUS_TOKEN ? { Authorization: 'Bearer ' + process.env.PROMETHEUS_TOKEN } : {},
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Prometheus request failed (HTTP ' + response.status + ')');
    const payload = await response.json();
    const series = payload?.data?.result;
    if (payload.status !== 'success' || !Array.isArray(series) || series.length !== 1) {
      throw new Error('Expected exactly one successful Prometheus metric series');
    }
    const value = Number(series[0]?.value?.[1]);
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid Prometheus sample');
    return value;
  }
  const maxErrorIncrease = Number(process.env.MAX_ERROR_RATE_INCREASE ?? '0.01');
  const maxLatencyRatio = Number(process.env.MAX_LATENCY_RATIO ?? '1.25');
  if (!Number.isFinite(maxErrorIncrease) || maxErrorIncrease < 0 ||
      !Number.isFinite(maxLatencyRatio) || maxLatencyRatio < 1) {
    throw new Error('Invalid metric thresholds');
  }
  try {
    const [stableErrors, canaryErrors, stableLatency, canaryLatency] = await Promise.all([
      query(process.env.BASELINE_ERROR_QUERY),
      query(process.env.CANARY_ERROR_QUERY),
      query(process.env.BASELINE_LATENCY_QUERY),
      query(process.env.CANARY_LATENCY_QUERY),
    ]);
    const errorPass = canaryErrors <= stableErrors + maxErrorIncrease;
    const latencyPass = stableLatency > 0 ? canaryLatency <= stableLatency * maxLatencyRatio : canaryLatency === 0;
    console.log(JSON.stringify({ stableErrors, canaryErrors, stableLatency, canaryLatency, errorPass, latencyPass }));
    if (!errorPass || !latencyPass) process.exitCode = 1;
  } catch (error) {
    console.error('Canary metrics unavailable/invalid:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1; // Never promote when evidence is unavailable.
  }
}
