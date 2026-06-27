import { prisma } from '../db/prisma.js';

/**
 * Indexer progress is tracked per topic in the IndexerCursor table so the poll
 * loop resumes from the last processed ledger after a restart.
 */

/** Last ledger processed for a topic, or null if the indexer has never run. */
export async function getCursorLedger(topic: string): Promise<number | null> {
  const row = await prisma.indexerCursor.findUnique({ where: { topic } });
  return row ? row.lastLedger : null;
}

/** Persist the last ledger processed for a topic (idempotent upsert). */
export async function setCursorLedger(topic: string, lastLedger: number): Promise<void> {
  await prisma.indexerCursor.upsert({
    where: { topic },
    create: { topic, lastLedger },
    update: { lastLedger },
  });
}
