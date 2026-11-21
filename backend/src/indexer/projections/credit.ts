import { prisma } from '../../db/prisma.js';
import type { DecodedEvent } from '../sorobanClient.js';
import { ensureUserId, toNumber, tupleArgs, warnUnparseable } from './helpers.js';

/**
 * Project a `("credit", "updated")` event — data `(creator, old_score, new_score)`.
 * Updates the user's current credit score and appends an entry to the history table.
 * Idempotent: replays on the same (creator, new_score, ledger) produce no duplicate
 * history rows.
 */
export async function projectCreditScoreUpdated(event: DecodedEvent): Promise<void> {
  const args = tupleArgs(event.value);
  const creator = args[0];
  const newScore = args[2]; // Skip old_score (args[1]) as it's not used off-chain
  
  if (typeof creator !== 'string') {
    return warnUnparseable(event, 'credit_updated');
  }

  const newScoreValue = toNumber(newScore);
  if (newScoreValue === null) {
    return warnUnparseable(event, 'credit_updated');
  }

  const userId = await ensureUserId(creator);

  // Transactional: creditScore + history are updated atomically
  // (isolation ReadCommitted, timeout 5000ms). No external calls inside.
  const historyId = `credit_history_${userId}_${event.ledger}`;
  await prisma.$transaction(
    async (tx) => {
      await tx.creditScore.upsert({
        where: { userId },
        create: {
          userId,
          value: newScoreValue,
          computedAt: new Date(),
        },
        update: {
          value: newScoreValue,
          computedAt: new Date(),
        },
      });

      await tx.creditScoreHistory.upsert({
        where: { id: historyId },
        create: {
          id: historyId,
          userId,
          value: newScoreValue,
          computedAt: new Date(),
        },
        update: {},
      });
    },
    {
      timeout: 5000,
      maxWait: 2000,
      isolationLevel: "ReadCommitted",
    },
  );
}
