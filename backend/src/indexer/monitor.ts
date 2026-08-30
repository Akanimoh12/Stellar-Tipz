import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { getLatestLedger } from './sorobanClient.js';
import { getCursorLedger } from './cursor.js';

/** Cursor topic the poll loop advances after each successful tick. */
const CURSOR_TOPIC = 'tip_events';

/** Snapshot of indexer health/lag observations. */
export interface IndexerMonitorReport {
  /** Lag (ledgers) between the chain head and the last processed ledger. */
  lagLedgers: number;
  /** Chain head ledger at the time of the last check. */
  latestLedger: number;
  /** Last ledger successfully processed by the indexer, or null if never advanced. */
  lastProcessedLedger: number | null;
  /** True when the cursor is unchanged across the configured number of polls. */
  stalled: boolean;
  /** Records processed in the last completed tick. */
  lastTickProcessed: number;
  /** Cumulative events processed since the monitor started. */
  eventsProcessedTotal: number;
  /** Cumulative processing errors observed (projection failures). */
  errorsTotal: number;
  /** Cumulative chain reorganizations detected & recovered (issue #1257). */
  reorgsTotal: number;
  /** The most recent reorg, if any — for the /health/ready and alert payload. */
  lastReorg: ReorgObservation | null;
  /** Whether the indexer is considered healthy. */
  healthy: boolean;
}

/** A single detected-and-recovered chain reorg (issue #1257). */
export interface ReorgObservation {
  topic: string;
  forkLedger: number;
  divergedAt: number | null;
  removed: { eventLog: number; tips: number; refunds: number };
  at: string;
}

// In-process counters. These are intentionally module-level so multiple poll
// loops share a single view and the values survive individual ticks.
let lastProcessedLedger: number | null = null;
let lastTickProcessed = 0;
let eventsProcessedTotal = 0;
let errorsTotal = 0;
let unchangedIntervals = 0;
let reorgsTotal = 0;
let lastReorg: ReorgObservation | null = null;

/**
 * Register the result of one indexer projection batch (a full poll tick).
 * Tracks a stall signal when the cursor does not advance, and processing/error
 * rates for exposure via /metrics and /health/ready.
 */
export function recordIndexerTick(processed: number): void {
  const previous = lastProcessedLedger;

  // Record processed/error totals and the advanced cursor ledger.
  // The caller passes the max ledger processed this tick via the projection hook.
  eventsProcessedTotal += processed;
  lastTickProcessed = processed;

  // Stall detection: if the processed ledger observation did not change across
  // the configured number of polls, the worker is likely crashed/blocked even
  // when the chain is quiet.
  if (previous === lastProcessedLedger) {
    unchangedIntervals++;
  } else {
    unchangedIntervals = 0;
  }
}

/** Marks a ledger as successfully processed (used by the projection hook). */
export function noteProcessedLedger(ledger: number): void {
  lastProcessedLedger = Math.max(lastProcessedLedger ?? -1, ledger);
}

/** Records a single projection/processing failure. */
export function noteIndexerError(): void {
  errorsTotal++;
}

/**
 * Records a detected-and-recovered chain reorganization (issue #1257). Always
 * logs at `error` — a reorg is page-worthy even when recovery succeeds, and
 * the count is exposed on /metrics and /health/ready so alerting can fire on
 * `increase(indexer_reorgs_total[1h]) > 0`.
 */
export function noteReorg(o: Omit<ReorgObservation, 'at'>): void {
  reorgsTotal++;
  lastReorg = { ...o, at: new Date().toISOString() };
  logger.error({ ...lastReorg }, 'Indexer recovered from a chain reorganization');
}

/** Whether the last observed tick advanced the cursor. */
export function isStalled(): boolean {
  return unchangedIntervals >= config.indexer.stallIntervals;
}

/**
 * Compute the current indexer health/lag report against the live chain head.
 * Also updates the shared records (last processed ledger is reconciled against
 * the persisted cursor so the /health/ready view matches the DB).
 */
export async function getIndexerReport(): Promise<IndexerMonitorReport> {
  // Reconcile our in-process view with the persisted cursor so a freshly
  // started process reports real lag instead of starting at null.
  const persisted = await getCursorLedger(CURSOR_TOPIC);
  if (persisted !== null && lastProcessedLedger === null) {
    lastProcessedLedger = persisted;
  }

  const latestLedger = await getLatestLedger();
  const lastProcessed = lastProcessedLedger;
  const lag = lastProcessed === null ? latestLedger : Math.max(0, latestLedger - lastProcessed);
  const stalled = isStalled();

  if (stalled && lastTickProcessed > 0) {
    unchangedIntervals = 0; // not stalled if we actually processed events
  }

  const healthy = !stalled && lag <= config.indexer.lagThresholdLedgers;

  if (!healthy && lag > config.indexer.lagThresholdLedgers) {
    logger.warn(
      { lagLedgers: lag, latestLedger, lastProcessedLedger: lastProcessed },
      'Indexer lag exceeds threshold',
    );
  }
  if (stalled) {
    logger.error(
      { lagLedgers: lag, latestLedger, lastProcessedLedger: lastProcessed },
      'Indexer cursor is stalled — worker possibly crashed or blocked',
    );
  }

  return {
    lagLedgers: lag,
    latestLedger,
    lastProcessedLedger: lastProcessed,
    stalled,
    lastTickProcessed,
    eventsProcessedTotal,
    errorsTotal,
    reorgsTotal,
    lastReorg,
    healthy,
  };
}

/** Lightweight, synchronous in-memory snapshot for /metrics (no network I/O). */
export function getIndexerSnapshot(): {
  lastProcessedLedger: number | null;
  lastTickProcessed: number;
  eventsProcessedTotal: number;
  errorsTotal: number;
  reorgsTotal: number;
  lastReorg: ReorgObservation | null;
} {
  return {
    lastProcessedLedger,
    lastTickProcessed,
    eventsProcessedTotal,
    errorsTotal,
    reorgsTotal,
    lastReorg,
  };
}

/** Reset module-level counters (test helper). */
export function resetIndexerMonitor(): void {
  lastProcessedLedger = null;
  lastTickProcessed = 0;
  eventsProcessedTotal = 0;
  errorsTotal = 0;
  unchangedIntervals = 0;
  reorgsTotal = 0;
  lastReorg = null;
}