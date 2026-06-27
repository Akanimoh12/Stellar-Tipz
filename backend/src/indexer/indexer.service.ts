import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { SorobanClient } from './soroban.client.js';
import { CursorStore } from './cursor.store.js';
import { EventLogStore } from './event-log.store.js';
import { registerClosable } from '../common/utils/lifecycle.js';
import type { IndexerStatus } from './indexer.types.js';

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

  private async processLedgerRange(fromLedger: number, toLedger?: number): Promise<void> {
    const contractIds = this.contractId ? [this.contractId] : undefined;
    const events = await this.client.getAllEvents(fromLedger, { contractIds });
    if (events.length === 0) {
      await this.cursors.advance('contract_events', toLedger ?? fromLedger);
      return;
    }

    await this.events.persist(events);

    const maxLedger = Math.max(...events.map((e) => e.ledger));
    await this.cursors.advance('contract_events', maxLedger);
    logger.debug({ count: events.length, maxLedger }, 'Indexer processed events');
  }
}
