import { beforeEach, describe, expect, it } from 'vitest';
import { renderMetrics } from '../common/observability/prometheus.js';
import { observeContractEvent, resetContractEventAnomalyDetector } from './anomalyDetection.js';
import type { DecodedEvent } from './sorobanClient.js';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const withdrawal = (txHash: string, amount = '1000000'): DecodedEvent => ({
  topic: 'tip_withdrawn',
  txHash,
  ledger: 42,
  pagingToken: '42-1',
  value: [1, ACCOUNT, amount, '1000'],
});

beforeEach(() => resetContractEventAnomalyDetector());

describe('contract event anomaly detection (#1360)', () => {
  it('tracks first-seen contract events by their canonical type', async () => {
    observeContractEvent(withdrawal('event-metric'), 1_000);
    expect(await renderMetrics()).toContain(
      'tipz_contract_events_total{event_type="tip_withdrawn"} 1',
    );
  });

  it('flags repeated withdrawals by the same account within the burst window', async () => {
    observeContractEvent(withdrawal('burst-1'), 1_000);
    observeContractEvent(withdrawal('burst-2'), 2_000);
    observeContractEvent(withdrawal('burst-3'), 3_000);
    expect(await renderMetrics()).toContain(
      'tipz_contract_event_anomalies_total{kind="withdrawal_burst",event_type="tip_withdrawn"} 1',
    );
  });

  it('flags a high-value withdrawal with the configurable production threshold', async () => {
    observeContractEvent(withdrawal('high-value', '10000000000'), 1_000);
    expect(await renderMetrics()).toContain(
      'tipz_contract_event_anomalies_total{kind="high_value",event_type="tip_withdrawn"} 1',
    );
  });

  it('flags a completed event window that exceeds its rolling baseline', async () => {
    const window = 60_000;
    for (let index = 0; index < 10; index++) {
      observeContractEvent(withdrawal(`baseline-${index}`), index * window + 1);
    }
    // The tenth completed one-event window is the baseline; complete a burst window.
    for (let index = 0; index < 5; index++)
      observeContractEvent(withdrawal(`spike-${index}`), 10 * window + 1 + index);
    observeContractEvent(withdrawal('close-spike'), 11 * window + 1);
    expect(await renderMetrics()).toContain(
      'tipz_contract_event_anomalies_total{kind="rate_deviation",event_type="tip_withdrawn"} 1',
    );
  });
});
