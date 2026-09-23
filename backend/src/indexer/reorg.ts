/**
 * Chain-reorganization detection & recovery for the indexer (issue #1257).
 *
 * The finality gate in `poller.ts` (`INDEXER_FINALITY_DEPTH`) is the first line
 * of defence — events past the confirmation buffer are simply not projected.
 * This module handles the residual case: a reorg deeper than that buffer, or a
 * transient RPC inconsistency that slipped a phantom event through before the
 * gate existed. Detection is cheap; the alternative is silent corruption.
 */
import { prisma } from '../db/prisma.js';
import { logger } from '../common/utils/logger.js';
import { config } from '../config/index.js';
import { getLedgerHash } from './sorobanClient.js';
import {
  getRecentCheckpoints,
  deleteCheckpointsAbove,
  type Checkpoint,
} from './ledger-checkpoint.store.js';
import { noteReorg } from './monitor.js';

export interface ReorgDetection {
  reorged: boolean;
  /** Highest ledger whose stored hash still matches the chain, or null. */
  forkLedger: number | null;
  /** Highest ledger whose stored hash no longer matches the chain, or null. */
  divergedAt: number | null;
}

type HashLookup = (sequence: number) => Promise<string | null>;

/**
 * Walk stored checkpoints newest→oldest, comparing each stored hash against the
 * chain. The first ledger that still matches is the fork point; anything above
 * it must be rolled back. An inconclusive lookup (`null` — Horizon has no such
 * ledger) is skipped rather than treated as a divergence.
 */
export async function detectReorg(
  checkpoints: Checkpoint[],
  getHash: HashLookup = getLedgerHash,
): Promise<ReorgDetection> {
  let divergedAt: number | null = null;

  for (const cp of checkpoints) {
    const chainHash = await getHash(cp.ledger);
    if (chainHash === null) continue; // inconclusive — check an older one
    if (chainHash === cp.ledgerHash) {
      return { reorged: divergedAt !== null, forkLedger: cp.ledger, divergedAt };
    }
    if (divergedAt === null) divergedAt = cp.ledger;
  }

  if (divergedAt !== null) {
    // Every checkpoint we could verify diverged — the fork is below the whole
    // retained window. Roll back to just before its oldest entry.
    const oldest = checkpoints[checkpoints.length - 1]?.ledger ?? divergedAt;
    return { reorged: true, forkLedger: Math.max(0, oldest - 1), divergedAt };
  }

  return { reorged: false, forkLedger: null, divergedAt: null };
}

export interface RollbackResult {
  eventLog: number;
  tips: number;
  refunds: number;
}

/**
 * Roll a topic back to `forkLedger`: in one transaction, delete `Refund` +
 * `Tip` + `EventLog` rows above the fork, drop stale `LedgerCheckpoint`s, and
 * reset `IndexerCursor` to the fork. The next poll re-reads from
 * `forkLedger + 1` and re-projects the canonical chain — deterministic
 * projections (`Goal`, `Subscription`, `CreditScore`, …) self-heal on
 * re-projection, so only the ledger-stamped tables need explicit deletion.
 */
export async function rollbackToLedger(topic: string, forkLedger: number): Promise<RollbackResult> {
  return prisma.$transaction(async (tx) => {
    const { count: refunds } = await tx.refund.deleteMany({
      where: { tip: { ledger: { gt: forkLedger } } },
    });
    const { count: tips } = await tx.tip.deleteMany({ where: { ledger: { gt: forkLedger } } });
    const { count: eventLog } = await tx.eventLog.deleteMany({ where: { ledger: { gt: forkLedger } } });
    await deleteCheckpointsAbove(topic, forkLedger, tx);
    await tx.indexerCursor.upsert({
      where: { topic },
      create: { topic, lastLedger: forkLedger },
      update: { lastLedger: forkLedger },
    });
    return { eventLog, tips, refunds };
  });
}

/**
 * Detect-and-recover, called at the top of each poll tick. Returns `true` when
 * a reorg was handled (the caller should skip the rest of this tick and let
 * the next one reprocess from the fork).
 */
export async function checkAndHandleReorg(topic: string): Promise<boolean> {
  if (config.indexer.reorgLookback <= 0) return false;

  const checkpoints = await getRecentCheckpoints(topic);
  if (checkpoints.length === 0) return false;

  const detection = await detectReorg(checkpoints);
  if (!detection.reorged || detection.forkLedger === null) return false;

  logger.error(
    { topic, forkLedger: detection.forkLedger, divergedAt: detection.divergedAt },
    'Chain reorg detected — rolling back affected projections',
  );

  const removed = await rollbackToLedger(topic, detection.forkLedger);
  noteReorg({
    topic,
    forkLedger: detection.forkLedger,
    divergedAt: detection.divergedAt,
    removed,
  });

  logger.error(
    { topic, forkLedger: detection.forkLedger, ...removed },
    'Reorg rollback complete — reprocessing from the fork on the next tick',
  );
  return true;
}
