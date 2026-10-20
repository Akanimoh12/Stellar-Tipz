/**
 * Pure validation logic for the backup restore-verification job (issue #1256).
 *
 * Kept free of DB / filesystem / network I/O so it is unit-testable without a
 * live Postgres. `verify-backup-restore.ts` wires these against a real restored
 * scratch database.
 */

/** Core tables that must be present (and, for a prod dump, non-empty). */
export const CORE_TABLES = [
  'User',
  'Tip',
  'Refund',
  'Goal',
  'Subscription',
  'EventLog',
  'IndexerCursor',
  'Withdrawal',
] as const;

export type CoreTable = (typeof CORE_TABLES)[number];

export interface RowCountCheckInput {
  /** Row counts observed in the freshly restored scratch database. */
  restored: Record<string, number>;
  /** Row counts from the previous successful verification, if any. */
  baseline?: Record<string, number>;
  /**
   * A restored table may legitimately shrink (retention pruning). Flag only a
   * drop larger than this fraction of the baseline. Default 20%.
   */
  maxShrinkFraction?: number;
  /** When true, every core table must be non-empty (a production dump). */
  requireNonEmpty?: boolean;
}

export interface CheckResult {
  ok: boolean;
  failures: string[];
  warnings: string[];
}

/** Validate restored row counts against expectations and a prior baseline. */
export function checkRowCounts(input: RowCountCheckInput): CheckResult {
  const maxShrink = input.maxShrinkFraction ?? 0.2;
  const failures: string[] = [];
  const warnings: string[] = [];

  for (const table of CORE_TABLES) {
    const count = input.restored[table];
    if (count === undefined) {
      failures.push(`table "${table}" is missing from the restored database`);
      continue;
    }
    if (input.requireNonEmpty && count === 0) {
      failures.push(`table "${table}" is empty in a restore that should contain production data`);
    }
    const base = input.baseline?.[table];
    if (base !== undefined && base > 0) {
      const shrink = (base - count) / base;
      if (shrink > maxShrink) {
        failures.push(
          `table "${table}" dropped ${(shrink * 100).toFixed(1)}% vs baseline ` +
            `(${base} -> ${count}); exceeds the ${(maxShrink * 100).toFixed(0)}% tolerance — possible corruption`,
        );
      } else if (count < base) {
        warnings.push(`table "${table}" shrank ${base} -> ${count} (within tolerance)`);
      }
    }
  }

  return { ok: failures.length === 0, failures, warnings };
}

/**
 * The newest applied migration name in a restored dump must match the newest
 * local migration directory — otherwise the dump predates a schema change and
 * a restore would need `prisma migrate deploy` before the app can use it.
 */
export function checkSchemaVersion(
  latestAppliedInDump: string | null,
  localMigrationDirs: string[],
): CheckResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  const localLatest = [...localMigrationDirs].sort().at(-1) ?? null;

  if (!latestAppliedInDump) {
    failures.push('restored database has no rows in _prisma_migrations');
  } else if (!localLatest) {
    warnings.push('no local migration directories to compare against');
  } else if (latestAppliedInDump !== localLatest) {
    const dumpBehind = latestAppliedInDump < localLatest;
    (dumpBehind ? warnings : failures).push(
      `schema version mismatch: dump has "${latestAppliedInDump}", repo has "${localLatest}"` +
        (dumpBehind ? ' — dump predates a migration; run `prisma migrate deploy` after restore' : ''),
    );
  }

  return { ok: failures.length === 0, failures, warnings };
}

export interface SpotCheckInput {
  /** `MAX(ledger)` in EventLog. */
  eventLogMaxLedger: number | null;
  /** `IndexerCursor.lastLedger` for the tip-events topic. */
  cursorLedger: number | null;
  /** Count of `Tip` rows whose `fromAddress` has no matching `User`. */
  orphanTipSenders: number;
  /** Count of `Refund` rows with no matching `Tip`. */
  orphanRefunds: number;
  /**
   * Largest gap between consecutive distinct `EventLog.ledger` values in the
   * processed range. A large gap can mean events were lost.
   */
  largestEventLedgerGap: number;
  /** Gap above which we fail. Default 500 ledgers (~40 min at 5s/ledger). */
  maxAllowedLedgerGap?: number;
}

/** Cheap referential-integrity / plausibility checks on the restored data. */
export function runSpotChecks(input: SpotCheckInput): CheckResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const maxGap = input.maxAllowedLedgerGap ?? 500;

  if (input.orphanRefunds > 0) {
    failures.push(`${input.orphanRefunds} Refund row(s) reference a Tip that does not exist`);
  }
  if (input.orphanTipSenders > 0) {
    warnings.push(
      `${input.orphanTipSenders} Tip row(s) have a fromAddress with no User row ` +
        '(expected for external senders, but a spike is worth a look)',
    );
  }
  if (
    input.eventLogMaxLedger !== null &&
    input.cursorLedger !== null &&
    input.cursorLedger + 1_000 < input.eventLogMaxLedger
  ) {
    failures.push(
      `IndexerCursor (${input.cursorLedger}) is >1000 ledgers behind EventLog MAX ` +
        `(${input.eventLogMaxLedger}) in the restored dump — cursor/events are inconsistent`,
    );
  }
  if (input.largestEventLedgerGap > maxGap) {
    failures.push(
      `largest gap between consecutive EventLog ledgers is ${input.largestEventLedgerGap} ` +
        `(> ${maxGap}); events may have been lost`,
    );
  }

  return { ok: failures.length === 0, failures, warnings };
}

export interface RtoReportInput {
  dumpLabel: string;
  dumpSizeBytes: number;
  fetchMs: number;
  restoreMs: number;
  validateMs: number;
}

/** Human- and machine-readable restore-timing summary for the CI artifact. */
export function formatRtoReport(input: RtoReportInput): string {
  const totalMs = input.fetchMs + input.restoreMs + input.validateMs;
  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const mib = (input.dumpSizeBytes / 1024 / 1024).toFixed(1);
  return [
    '## Backup restore verification — timing',
    '',
    `- dump: \`${input.dumpLabel}\` (${mib} MiB)`,
    `- fetch:    ${s(input.fetchMs)}`,
    `- restore:  ${s(input.restoreMs)}   ← the measured RTO component`,
    `- validate: ${s(input.validateMs)}`,
    `- **total:  ${s(totalMs)}**`,
    '',
    `rto_restore_ms=${input.restoreMs}`,
    `rto_total_ms=${totalMs}`,
  ].join('\n');
}

/** Combine sub-results; overall ok only if every part is ok. */
export function combine(...results: CheckResult[]): CheckResult {
  return {
    ok: results.every((r) => r.ok),
    failures: results.flatMap((r) => r.failures),
    warnings: results.flatMap((r) => r.warnings),
  };
}
