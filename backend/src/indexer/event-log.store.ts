import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../common/utils/logger.js';

function deterministicId(event: { txHash: string; ledger: number; topic: string }): string {
  return createHash('sha256')
    .update(`${event.txHash}:${event.ledger}:${event.topic}`)
    .digest('hex')
    .slice(0, 30);
}

export class EventLogStore {
  async persist(
    events: Array<{
      id: string;
      txHash: string;
      topic: string;
      ledger: number;
      contractId: string;
      value: Record<string, unknown>;
    }>,
  ): Promise<number> {
    const rows = events.map((e) => ({
      id: deterministicId({ txHash: e.txHash, ledger: e.ledger, topic: e.topic }),
      topic: e.topic,
      ledger: e.ledger,
      txHash: e.txHash,
      data: { contractId: e.contractId, value: e.value, eventId: e.id } as Prisma.InputJsonValue,
    }));

    if (rows.length === 0) return 0;

    const result = await prisma.eventLog.createMany({
      data: rows,
      skipDuplicates: true,
    });

    if (result.count < rows.length) {
      logger.debug({ skipped: rows.length - result.count }, 'Duplicate events skipped');
    }

    return result.count;
  }

  async getEventsForLedger(ledger: number): Promise<Array<{ id: string; topic: string; txHash: string }>> {
    return prisma.eventLog.findMany({
      where: { ledger },
      select: { id: true, topic: true, txHash: true },
    });
  }

  async count(): Promise<number> {
    return prisma.eventLog.count();
  }
}
