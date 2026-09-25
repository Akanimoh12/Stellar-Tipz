import { createHash } from 'node:crypto';
import type { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prisma } from '../db/prisma.js';

function deterministicId(event: { txHash: string; ledger: number; topic: string }): string {
  return createHash('sha256')
    .update(`${event.txHash}:${event.ledger}:${event.topic}`)
    .digest('hex')
    .slice(0, 30);
}

export class EventLogStore {
  /**
   * Persist events. Each row is inserted individually for idempotency (P2002 ignored).
   * For bulk ledger ranges, the caller (IndexerService.processLedgerRange) wraps
   * persist + cursor advance in a single transaction (see indexer.service.ts).
   * This method itself uses a transaction with timeout for standalone calls.
   */
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
      data: { contractId: e.contractId, value: e.value, eventId: e.id } as Record<string, unknown>,
    }));

    if (rows.length === 0) return 0;

    // Transactional boundary: for standalone calls, wrap in transaction
    // (isolation ReadCommitted, timeout 8000ms). No external calls inside.
    return prisma.$transaction(
      async (tx) => {
        let count = 0;
        for (const row of rows) {
          try {
            await (tx as typeof prisma).eventLog.create({ data: row as any });
            count++;
          } catch (err) {
            const error = err as PrismaClientKnownRequestError;
            if (error.code === "P2002") {
              // Unique constraint violation - event already exists (idempotent)
              continue;
            }
            throw err;
          }
        }
        return count;
      },
      {
        timeout: 8000,
        maxWait: 2000,
        isolationLevel: "ReadCommitted",
      },
    );
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