import { env } from '../config/env.js';
import { logger } from '../common/utils/logger.js';
import { createCounter, createGauge } from '../common/observability/prometheus.js';
import type { DecodedEvent } from './sorobanClient.js';

/**
 * Lightweight, bounded anomaly detection for contract events (issue #1360).
 *
 * Detection intentionally lives beside the indexer rather than in a separate
 * worker: only successfully persisted, first-seen events reach it, so replayed
 * ledgers cannot produce false rate spikes or duplicate security alerts. The
 * rolling baseline is process-local; Prometheus counters and alert rules are
 * the durable, cross-instance source for paging and investigation.
 */
export type AnomalyKind = 'rate_deviation' | 'high_value' | 'withdrawal_burst';

const contractEventsTotal = createCounter({
  name: 'contract_events_total',
  help: 'First-seen contract events processed by the indexer, by event type',
  labelNames: ['event_type'] as const,
});
const contractEventAnomaliesTotal = createCounter({
  name: 'contract_event_anomalies_total',
  help: 'Contract-event anomalies detected by the indexer, by kind and event type',
  labelNames: ['kind', 'event_type'] as const,
});
const contractEventAnomalyLastSeen = createGauge({
  name: 'contract_event_anomaly_last_seen_timestamp_seconds',
  help: 'Unix timestamp of the latest detected contract-event anomaly',
  labelNames: ['kind', 'event_type'] as const,
});

let currentWindowStart: number | null = null;
const currentCounts = new Map<string, number>();
const historicalCounts = new Map<string, number[]>();
const withdrawalTimesByAccount = new Map<string, number[]>();

function eventType(topic: string): string {
  // Contract topics are controlled by this project, but retaining a bounded
  // fallback protects Prometheus from an accidental high-cardinality label.
  return /^[a-z0-9_]{1,64}$/.test(topic) ? topic : 'unknown';
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function populationStdDev(values: number[], average: number): number {
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length,
  );
}

function report(
  kind: AnomalyKind,
  event: DecodedEvent,
  context: Record<string, unknown>,
  now: number,
): void {
  const type = eventType(event.topic);
  contractEventAnomaliesTotal.inc({ kind, event_type: type });
  contractEventAnomalyLastSeen.set({ kind, event_type: type }, now / 1000);
  logger.warn(
    { anomaly: kind, eventType: type, txHash: event.txHash, ledger: event.ledger, ...context },
    'Contract event anomaly detected',
  );
}

function closeWindow(event: DecodedEvent, now: number): void {
  if (currentWindowStart === null) {
    currentWindowStart =
      Math.floor(now / env.INDEXER_ANOMALY_WINDOW_MS) * env.INDEXER_ANOMALY_WINDOW_MS;
    return;
  }
  if (now < currentWindowStart + env.INDEXER_ANOMALY_WINDOW_MS) return;

  for (const [type, observed] of currentCounts) {
    const history = historicalCounts.get(type) ?? [];
    if (history.length >= env.INDEXER_ANOMALY_BASELINE_WINDOWS) {
      const baseline = history.slice(-env.INDEXER_ANOMALY_BASELINE_WINDOWS);
      const average = mean(baseline);
      const deviation = populationStdDev(baseline, average);
      const threshold = Math.max(
        average + deviation * env.INDEXER_ANOMALY_STDDEV_THRESHOLD,
        average + 3,
      );
      if (observed > threshold) {
        report(
          'rate_deviation',
          event,
          {
            observedEvents: observed,
            baselineMean: Number(average.toFixed(2)),
            baselineStdDev: Number(deviation.toFixed(2)),
            threshold: Number(threshold.toFixed(2)),
            windowMs: env.INDEXER_ANOMALY_WINDOW_MS,
          },
          now,
        );
      }
    }
    history.push(observed);
    historicalCounts.set(type, history.slice(-env.INDEXER_ANOMALY_BASELINE_WINDOWS));
  }
  currentCounts.clear();
  currentWindowStart =
    Math.floor(now / env.INDEXER_ANOMALY_WINDOW_MS) * env.INDEXER_ANOMALY_WINDOW_MS;
}

function amountAndAccount(
  event: DecodedEvent,
): { amount: bigint; account?: string; isWithdrawal: boolean } | null {
  const value = event.value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const rawAmount = record.amount;
    if (
      typeof rawAmount === 'string' ||
      typeof rawAmount === 'number' ||
      typeof rawAmount === 'bigint'
    ) {
      try {
        return {
          amount: BigInt(rawAmount),
          account:
            typeof record.creator === 'string'
              ? record.creator
              : typeof record.to === 'string'
                ? record.to
                : undefined,
          isWithdrawal:
            event.topic === 'tip_withdrawn' ||
            event.topic === 'creator_emerg_wdr' ||
            event.topic === 'wd_exec',
        };
      } catch {
        return null;
      }
    }
    return null;
  }
  if (!Array.isArray(value)) return null;
  const fields = value[0] === 1 || value[0] === '1' ? value.slice(1) : value;
  const withdrawal =
    event.topic === 'tip_withdrawn' ||
    event.topic === 'creator_emerg_wdr' ||
    event.topic === 'wd_exec';
  const amountIndex =
    event.topic === 'wd_exec'
      ? 2
      : withdrawal
        ? 1
        : event.topic === 'tip' || event.topic === 'tip_sent'
          ? 2
          : -1;
  const rawAmount = fields[amountIndex];
  if (
    amountIndex < 0 ||
    (typeof rawAmount !== 'string' &&
      typeof rawAmount !== 'number' &&
      typeof rawAmount !== 'bigint')
  )
    return null;
  try {
    return {
      amount: BigInt(rawAmount),
      account: typeof fields[0] === 'string' ? fields[0] : undefined,
      isWithdrawal: withdrawal,
    };
  } catch {
    return null;
  }
}

/** Records one first-seen event and emits structured, actionable anomaly signals. */
export function observeContractEvent(event: DecodedEvent, now = Date.now()): void {
  closeWindow(event, now);
  const type = eventType(event.topic);
  contractEventsTotal.inc({ event_type: type });
  currentCounts.set(type, (currentCounts.get(type) ?? 0) + 1);

  const transaction = amountAndAccount(event);
  if (!transaction) return;
  if (transaction.amount >= BigInt(env.INDEXER_HIGH_VALUE_STROOPS)) {
    report(
      'high_value',
      event,
      {
        amountStroops: transaction.amount.toString(),
        thresholdStroops: env.INDEXER_HIGH_VALUE_STROOPS,
        account: transaction.account,
      },
      now,
    );
  }
  if (!transaction.isWithdrawal || !transaction.account) return;

  const cutoff = now - env.INDEXER_WITHDRAWAL_BURST_WINDOW_MS;
  const recent = (withdrawalTimesByAccount.get(transaction.account) ?? []).filter(
    (time) => time >= cutoff,
  );
  recent.push(now);
  withdrawalTimesByAccount.set(transaction.account, recent);
  if (recent.length === env.INDEXER_WITHDRAWAL_BURST_COUNT) {
    report(
      'withdrawal_burst',
      event,
      {
        account: transaction.account,
        withdrawals: recent.length,
        windowMs: env.INDEXER_WITHDRAWAL_BURST_WINDOW_MS,
        amountStroops: transaction.amount.toString(),
      },
      now,
    );
  }
}

/** Test-only state reset. */
export function resetContractEventAnomalyDetector(): void {
  currentWindowStart = null;
  currentCounts.clear();
  historicalCounts.clear();
  withdrawalTimesByAccount.clear();
}
