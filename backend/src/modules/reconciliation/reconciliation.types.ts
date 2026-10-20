/**
 * Data consistency reconciliation types.
 *
 * Defines structures for detecting and reporting discrepancies between
 * on-chain state and off-chain projections.
 *
 * Issue #1271
 */

export interface ReconciliationConfig {
  /** Sampling rate (0-1) - fraction of records to check per run */
  samplingRate: number;
  /** Maximum RPC calls per run to bound cost */
  maxRpcCalls: number;
  /** Auto-repair enabled for safe discrepancy classes */
  autoRepairEnabled: boolean;
  /** Discrepancy rate threshold for alerting (0-1) */
  alertThreshold: number;
}

export interface Discrepancy {
  type: "balance" | "tip_total" | "profile_field" | "leaderboard_position";
  entityId: string;
  entityType: "user" | "tip" | "leaderboard";
  onChainValue: string | number | null;
  offChainValue: string | number | null;
  severity: "low" | "medium" | "high";
  canAutoRepair: boolean;
  description: string;
  detectedAt: Date;
}

export interface ReconciliationReport {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  config: ReconciliationConfig;
  totalSampled: number;
  discrepanciesFound: number;
  discrepancyRate: number;
  discrepancies: Discrepancy[];
  autoRepaired: number;
  requiresManualReview: number;
  metrics: {
    rpcCallsMade: number;
    durationMs: number;
  };
}

export interface ReconciliationSummary {
  lastRun: Date | null;
  lastDiscrepancyRate: number;
  trend: "improving" | "stable" | "degrading";
  alertLevel: "none" | "warning" | "critical";
}
