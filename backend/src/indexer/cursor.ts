import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

/**
 * Indexer progress is tracked per topic in the IndexerCursor table so the poll
 * loop resumes from the last processed ledger after a restart.
 */

/** Thrown when a cursor write carries an older leader epoch than the stored one (issue #1263). */
export class CursorFencedError extends Error {
  constructor(topic: string, fence: number, storedEpoch: number) {
    super(
      `Cursor write for "${topic}" rejected: leader epoch ${fence} is older than the stored epoch ${storedEpoch}`,
    );
    this.name = 'CursorFencedError';
  }
}

/** Last ledger processed for a topic, or null if the indexer has never run. */
export async function getCursorLedger(topic: string): Promise<number | null> {
  const row = await prisma.indexerCursor.findUnique({ where: { topic } });
  return row ? row.lastLedger : null;
}

/**
 * Locks the topic's cursor row for the rest of `tx` and rejects the write if a
 * newer leader has already committed. Call it first in any transaction that
 * commits indexer progress on behalf of a leader.
 */
export async function claimCursorFence(
  tx: Prisma.TransactionClient,
  topic: string,
  fence: number,
): Promise<void> {
  const [row] = await tx.$queryRaw<Array<{ leaderEpoch: number }>>`
    SELECT "leaderEpoch" FROM "IndexerCursor" WHERE "topic" = ${topic} FOR UPDATE
  `;
  if (row && row.leaderEpoch > fence) {
    throw new CursorFencedError(topic, fence, row.leaderEpoch);
  }
}

/**
 * Persist the last ledger processed for a topic (idempotent upsert). With a
 * `fence` (the writer's leader epoch) the write is rejected with
 * `CursorFencedError` if a newer leader has already written this cursor.
 */
export async function setCursorLedger(topic: string, lastLedger: number, fence?: number): Promise<void> {
  if (fence === undefined) {
    await prisma.indexerCursor.upsert({
      where: { topic },
      create: { topic, lastLedger },
      update: { lastLedger },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await claimCursorFence(tx, topic, fence);
    await tx.indexerCursor.upsert({
      where: { topic },
      create: { topic, lastLedger, leaderEpoch: fence },
      update: { lastLedger, leaderEpoch: fence },
    });
  });
}

/** Highest leader epoch any cursor has been written with (0 when none). */
export async function getMaxLeaderEpoch(): Promise<number> {
  const result = await prisma.indexerCursor.aggregate({ _max: { leaderEpoch: true } });
  return result._max.leaderEpoch ?? 0;
}
