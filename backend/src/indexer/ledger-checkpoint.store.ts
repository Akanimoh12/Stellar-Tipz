/**
 * Trailing window of processed `(ledger, ledgerHash)` pairs per indexer topic,
 * used to detect chain reorganizations (issue #1257).
 */
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';

export interface Checkpoint {
  ledger: number;
  ledgerHash: string;
}

/** Prisma-client-shaped subset the reorg transaction passes as `tx`. */
type Db = Pick<typeof prisma, 'ledgerCheckpoint'>;

/**
 * Record the hash of a ledger the indexer has fully processed, then prune the
 * window back to `INDEXER_REORG_LOOKBACK` most-recent entries for the topic.
 */
export async function recordCheckpoint(topic: string, ledger: number, ledgerHash: string): Promise<void> {
  await prisma.ledgerCheckpoint.upsert({
    where: { topic_ledger: { topic, ledger } },
    create: { topic, ledger, ledgerHash },
    update: { ledgerHash },
  });
  await pruneCheckpoints(topic);
}

/** Most-recent checkpoints for a topic, newest ledger first. */
export async function getRecentCheckpoints(
  topic: string,
  limit = config.indexer.reorgLookback,
): Promise<Checkpoint[]> {
  return prisma.ledgerCheckpoint.findMany({
    where: { topic },
    orderBy: { ledger: 'desc' },
    take: limit,
    select: { ledger: true, ledgerHash: true },
  });
}

/** Drop checkpoints beyond the retention window. */
export async function pruneCheckpoints(topic: string, keep = config.indexer.reorgLookback): Promise<void> {
  const stale = await prisma.ledgerCheckpoint.findMany({
    where: { topic },
    orderBy: { ledger: 'desc' },
    skip: keep,
    take: 1_000,
    select: { ledger: true },
  });
  if (stale.length === 0) return;
  await prisma.ledgerCheckpoint.deleteMany({
    where: { topic, ledger: { in: stale.map((r) => r.ledger) } },
  });
}

/** Delete every checkpoint above `ledger` (used by the reorg rollback). */
export async function deleteCheckpointsAbove(topic: string, ledger: number, db: Db = prisma): Promise<void> {
  await db.ledgerCheckpoint.deleteMany({ where: { topic, ledger: { gt: ledger } } });
}
