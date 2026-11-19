import { z } from 'zod';
import { booleanString } from './common.schema.js';

export const indexerEnvSchema = z.object({
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  INDEXER_START_LEDGER: z.coerce.number().optional(),
  /** Ledgers behind the chain head after which /health/ready turns unhealthy. */
  INDEXER_LAG_THRESHOLD_LEDGERS: z.coerce.number().int().positive().default(50),
  /** Consecutive polls with an unchanged cursor that trigger a stall alert. */
  INDEXER_STALL_INTERVALS: z.coerce.number().int().positive().default(3),
  /**
   * Confirmation depth (issue #1257). The indexer only projects events at
   * ledgers at or below `head - INDEXER_FINALITY_DEPTH`.
   */
  INDEXER_FINALITY_DEPTH: z.coerce.number().int().min(0).default(10),
  /**
   * How many recently-processed ledger hashes to retain for reorg detection
   * (issue #1257).
   */
  INDEXER_REORG_LOOKBACK: z.coerce.number().int().positive().default(64),
  /** Width of each in-process event-rate baseline window. */
  INDEXER_ANOMALY_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
  /** Number of completed windows retained to calculate the rolling baseline. */
  INDEXER_ANOMALY_BASELINE_WINDOWS: z.coerce.number().int().min(3).max(60).default(10),
  /** Standard deviations above the rolling mean that constitutes a rate anomaly. */
  INDEXER_ANOMALY_STDDEV_THRESHOLD: z.coerce.number().min(1).max(10).default(3),
  /** A single on-chain value at or above this number of stroops produces a high-value alert. */
  INDEXER_HIGH_VALUE_STROOPS: z.coerce.number().int().positive().default(10_000_000_000),
  /** Repeated withdrawals by one account within this window are suspicious. */
  INDEXER_WITHDRAWAL_BURST_WINDOW_MS: z.coerce.number().int().min(1_000).default(300_000),
  /** Number of withdrawals from one account in the burst window that triggers an alert. */
  INDEXER_WITHDRAWAL_BURST_COUNT: z.coerce.number().int().min(2).max(100).default(3),
  /**
   * Leader election for running several indexer instances (issue #1263).
   */
  INDEXER_LEADER_ELECTION_ENABLED: booleanString,
  /** Redis key holding the indexer leader lease. */
  INDEXER_LEADER_KEY: z.string().min(1).default('tipz:indexer:leader'),
  /** Lease lifetime; a crashed leader is replaced at most this long after its last renewal. */
  INDEXER_LEADER_LEASE_MS: z.coerce.number().int().min(1000).default(15_000),
  /** How often the leader renews (and a standby tries to acquire) the lease. */
  INDEXER_LEADER_RENEW_INTERVAL_MS: z.coerce.number().int().min(100).default(5_000),
});

export type IndexerEnv = z.infer<typeof indexerEnvSchema>;
