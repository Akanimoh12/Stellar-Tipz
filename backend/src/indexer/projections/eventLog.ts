import type { Prisma } from '@prisma/client';
import type { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import type { DecodedEvent } from '../sorobanClient.js';

/**
 * Store the raw decoded event for audit/replay, skipping if already stored.
 * Returns `true` if this is the first time the event has been seen (i.e. a new
 * row was inserted), `false` if it was already persisted (a replay).
 */
export async function persistEventLog(event: DecodedEvent): Promise<boolean> {
  const existing = await prisma.eventLog.findFirst({
    where: { txHash: event.txHash, topic: event.topic, ledger: event.ledger },
    select: { id: true },
  });
  if (existing) return false;

  try {
    await prisma.eventLog.create({
      data: {
        topic: event.topic,
        ledger: event.ledger,
        txHash: event.txHash,
        data: (event.value ?? {}) as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (err) {
    // Two workers may process the same ledger range concurrently. The unique
    // (txHash, topic, ledger) constraint (schema) is the source of truth: a
    // P2002 here means another worker already persisted this exact event, so
    // this is a replay, not an error — treat it as already-seen and continue.
    const error = err as PrismaClientKnownRequestError;
    if (error?.code === 'P2002') {
      logger.debug(
        { txHash: event.txHash, topic: event.topic, ledger: event.ledger },
        'Event insert raced with a duplicate; treating as replay',
      );
      return false;
    }
    throw err;
  }
}
