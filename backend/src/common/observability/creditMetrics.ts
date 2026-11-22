import { createCounter, createGauge, createHistogram } from './prometheus.js';

/** No user IDs: all labels have bounded cardinality for Prometheus. */
export const creditRuns = createCounter({
  name: 'credit_recompute_runs_total',
  help: 'Completed credit recomputation runs by outcome',
  labelNames: ['result'] as const,
});
export const creditScoresComputed = createCounter({
  name: 'credit_recompute_scores_total',
  help: 'Creator credit scores successfully recomputed',
});
export const creditFailures = createCounter({
  name: 'credit_recompute_failures_total',
  help: 'Individual creator score recomputation failures',
});
export const creditRunDuration = createHistogram({
  name: 'credit_recompute_duration_seconds',
  help: 'Elapsed wall-clock seconds for a full recomputation run',
  buckets: [1, 10, 30, 60, 300, 900, 1800, 3600, 21600],
});
export const creditLastSuccess = createGauge({
  name: 'credit_recompute_last_success_timestamp_seconds',
  help: 'Unix timestamp of the last error-free credit recomputation run',
});
export const creditOldestAge = createGauge({
  name: 'credit_score_oldest_age_seconds',
  help: 'Age of the oldest stored creator credit score observed in the last run; -1 if no creator has a score',
});
export const creditScoreDistribution = createGauge({
  name: 'credit_score_distribution',
  help: 'Counts of newly computed scores by bucket for the most recent recomputation run',
  labelNames: ['bucket'] as const,
});
export const CREDIT_BUCKETS = ['0_19', '20_39', '40_59', '60_79', '80_100'] as const;
export type CreditBucket = typeof CREDIT_BUCKETS[number];

export function bucketForCreditScore(score: number): CreditBucket {
  if (score < 20) return '0_19';
  if (score < 40) return '20_39';
  if (score < 60) return '40_59';
  if (score < 80) return '60_79';
  return '80_100';
}

export function observeCreditRun(
  counts: { processed: number; failed: number },
  durationSeconds: number,
  distribution: Record<CreditBucket, number>,
  oldestAgeSeconds: number,
  nowSeconds = Date.now() / 1000,
): void {
  creditRuns.inc({ result: counts.failed ? 'partial_failure' : 'success' });
  creditScoresComputed.inc(counts.processed);
  creditFailures.inc(counts.failed);
  creditRunDuration.observe(durationSeconds);
  creditOldestAge.set(oldestAgeSeconds);
  for (const bucket of CREDIT_BUCKETS) creditScoreDistribution.set({ bucket }, distribution[bucket]);
  if (counts.failed === 0) creditLastSuccess.set(nowSeconds);
}

export function observeCreditRunCrash(durationSeconds: number): void {
  creditRuns.inc({ result: 'crash' });
  creditFailures.inc();
  creditRunDuration.observe(durationSeconds);
}
