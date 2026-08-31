import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { SorobanClient } from './soroban.client.js';
import { CursorStore } from './cursor.store.js';
import { EventLogStore } from './event-log.store.js';
import { registerClosable } from '../common/utils/lifecycle.js';
import type { IndexerStatus } from './indexer.types.js';
import { prisma } from '../db/prisma.js';

export class IndexerService {
  private client: SorobanClient;
  private cursors: CursorStore;
  private events: EventLogStore;
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: IndexerStatus = { state: 'stopped' };
  private contractId: string | null;

  constructor(options?: {
    client?: SorobanClient;
    cursors?: CursorStore;
    events?: EventLogStore;
    contractId?: string;
  }) {
    this.client = options?.client ?? new SorobanClient();
    this.cursors = options?.cursors ?? new CursorStore();
    this.events = options?.events ?? new EventLogStore();
    this.contractId = options?.contractId ?? config.stellar.contractId ?? null;
  }

  getStatus(): IndexerStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.timer) return;

    registerClosable({
      name: 'Indexer',
      close: async () => this.stop(),
    });

    const startLedger = config.indexer.startLedger ?? (await this.cursors.get('contract_events')) ?? undefined;

    if (startLedger !== undefined) {
      logger.info({ startLedger }, 'Indexer catching up from saved cursor');
      await this.processLedgerRange(startLedger);
    } else {
      const latest = await this.client.getLatestLedger();
      logger.info({ latestLedger: latest }, 'Indexer starting from latest ledger');
      await this.cursors.advance('contract_events', latest);
    }

    this.timer = setInterval(() => {
      this.poll().catch((err) => {
        logger.error({ err }, 'Indexer poll cycle failed');
        this.status = { state: 'error', message: String(err) };
      });
    }, config.indexer.pollIntervalMs);

    logger.info({ pollIntervalMs: config.indexer.pollIntervalMs }, 'Indexer started');
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = { state: 'stopped' };
    logger.info('Indexer stopped');
  }

  private async poll(): Promise<void> {
    const lastProcessed = await this.cursors.get('contract_events');
    const targetLedger = await this.client.getLatestLedger();

    if (lastProcessed !== null && lastProcessed >= targetLedger) {
      return;
    }

    const fromLedger = lastProcessed !== null ? lastProcessed + 1 : targetLedger;
    this.status = { state: 'running', currentLedger: fromLedger, targetLedger };
    await this.processLedgerRange(fromLedger, targetLedger);
  }

  /**
   * Process a ledger range. External RPC fetch happens OUTSIDE the transaction;
   * persist + cursor advance are wrapped atomically (isolation ReadCommitted,
   * timeout 10000ms). If persist fails, cursor is not advanced (replay safe).
   */
  private async processLedgerRange(fromLedger: number, toLedger?: number): Promise<void> {
    // External call — never inside transaction
    const contractIds = this.contractId ? [this.contractId] : undefined;
    const events = await this.client.getAllEvents(fromLedger, { contractIds });
    if (events.length === 0) {
      await this.cursors.advance('contract_events', toLedger ?? fromLedger);
      return;
    }

    const maxLedger = Math.max(...events.map((e) => e.ledger));

    try {
      // Wrap persist + cursor in a single transaction for atomicity
      await prisma.$transaction(
        async (tx) => {
          // Persist events using the transaction client for atomicity
          // (delegate to store but with tx, or inline)
          for (const e of events) {
            const id = `${e.txHash}:${e.ledger}:${e.topic}`.slice(0, 30);
            // Use create with deterministic id; ignore P2002 (idempotent)
            try {
              await (tx as typeof prisma).eventLog.create({
                data: {
                  id,
                  topic: e.topic,
                  ledger: e.ledger,
                  txHash: e.txHash,
                  data: { contractId: e.contractId, value: e.value, eventId: e.id } as never,
                },
              });
            } catch (err: unknown) {
              const code = (err as { code?: string }).code;
              if (code === "P2002") continue;
              throw err;
            }
          }
          await (tx as typeof prisma).indexerCursor.upsert({
            where: { topic: "contract_events" },
            create: { topic: "contract_events", lastLedger: maxLedger },
            update: { lastLedger: maxLedger },
          });
        },
        {
          timeout: 10000,
          maxWait: 3000,
          isolationLevel: "ReadCommitted",
        },
      );
    } catch (err) {
      logger.error({ err, fromLedger }, "Failed to persist events; cursor not advanced");
      throw err;
    }

    logger.debug({ count: events.length, maxLedger }, "Indexer processed events");
  }
}