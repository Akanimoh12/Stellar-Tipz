/**
 * #1262 — Indexer service with dead letter queue (DLQ) support,
 * cursor advancement on failure isolation, and event replay capability.
 */

import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import { withRetry, RetryOptions } from './retry.js';
import {
  IDeadLetterStore,
  PrismaDeadLetterStore,
  InMemoryDeadLetterStore,
  DlqEntryRecord,
} from './dlq.store.js';

export interface IndexerEvent {
  id: string;
  topic: string;
  ledger: number;
  timestamp?: Date;
  data: Record<string, unknown>;
}

export type EventHandler = (event: IndexerEvent) => Promise<void>;

export interface IndexerServiceOptions {
  dlqStore?: IDeadLetterStore;
  retryOptions?: RetryOptions;
  useInMemoryStore?: boolean;
}

export class IndexerService {
  private dlqStore: IDeadLetterStore;
  private retryOptions: RetryOptions;
  private cursorMemory: Map<string, number> = new Map();

  constructor(options: IndexerServiceOptions = {}) {
    if (options.dlqStore) {
      this.dlqStore = options.dlqStore;
    } else if (options.useInMemoryStore) {
      this.dlqStore = new InMemoryDeadLetterStore();
    } else {
      this.dlqStore = new PrismaDeadLetterStore();
    }

    this.retryOptions = options.retryOptions ?? {
      maxAttempts: 3,
      initialDelayMs: 50,
      backoffFactor: 2,
    };
  }

  /**
   * Reads the current indexer cursor for a topic.
   */
  async getCursor(topic: string): Promise<number> {
    if (this.dlqStore instanceof InMemoryDeadLetterStore) {
      return this.cursorMemory.get(topic) ?? 0;
    }

    try {
      const cursor = await prisma.indexerCursor.findUnique({
        where: { topic },
      });
      return cursor?.lastLedger ?? 0;
    } catch {
      return this.cursorMemory.get(topic) ?? 0;
    }
  }

  /**
   * Updates the indexer cursor for a topic.
   */
  async setCursor(topic: string, ledger: number): Promise<void> {
    this.cursorMemory.set(topic, ledger);

    if (!(this.dlqStore instanceof InMemoryDeadLetterStore)) {
      try {
        await prisma.indexerCursor.upsert({
          where: { topic },
          create: { topic, lastLedger: ledger },
          update: { lastLedger: ledger },
        });
      } catch (err) {
        logger.warn({ err, topic, ledger }, 'Failed to persist indexer cursor to DB, cached in memory');
      }
    }
  }

  /**
   * Processes a single event with retry logic.
   * If the event permanently fails after max retries, it is moved to the DLQ,
   * and the cursor is permitted to advance to keep the ingestion pipeline live.
   */
  async processEvent(
    event: IndexerEvent,
    handler: EventHandler,
  ): Promise<{ success: boolean; movedToDlq: boolean; error?: string }> {
    let attemptsCount = 0;

    try {
      await withRetry(async (attempt) => {
        attemptsCount = attempt;
        await handler(event);
      }, this.retryOptions);

      // Successfully processed — advance cursor to this event's ledger
      await this.setCursor(event.topic, event.ledger);
      return { success: true, movedToDlq: false };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;

      logger.error(
        {
          topic: event.topic,
          ledger: event.ledger,
          eventId: event.id,
          attempts: attemptsCount,
          error: errorMessage,
        },
        'Event processing failed past max retries; isolating to DLQ and advancing cursor',
      );

      // Move poisoned event to Dead Letter Queue
      await this.dlqStore.push({
        topic: event.topic,
        ledger: event.ledger,
        eventId: event.id,
        payload: event.data,
        error: errorMessage,
        stack,
        attempts: attemptsCount,
      });

      // Advance cursor past the poisoned event so the pipeline is not halted
      await this.setCursor(event.topic, event.ledger);

      return {
        success: false,
        movedToDlq: true,
        error: errorMessage,
      };
    }
  }

  /**
   * Processes a batch of events sequentially, updating the cursor and isolating failures.
   */
  async processBatch(
    events: IndexerEvent[],
    handler: EventHandler,
  ): Promise<{ processed: number; dlqCount: number; currentLedger: number }> {
    let processed = 0;
    let dlqCount = 0;
    let currentLedger = 0;

    for (const event of events) {
      const result = await this.processEvent(event, handler);
      if (result.success) {
        processed++;
      } else if (result.movedToDlq) {
        dlqCount++;
      }
      currentLedger = event.ledger;
    }

    return { processed, dlqCount, currentLedger };
  }

  /**
   * Replays a previously failed DLQ entry after bug fix or dependency restoration.
   */
  async replayDlqEntry(
    id: string,
    handler: EventHandler,
  ): Promise<{ success: boolean; error?: string }> {
    const entry = await this.dlqStore.get(id);
    if (!entry) {
      return { success: false, error: `DLQ entry ${id} not found` };
    }

    const syntheticEvent: IndexerEvent = {
      id: entry.eventId ?? entry.id,
      topic: entry.topic,
      ledger: entry.ledger,
      data: (entry.payload as Record<string, unknown>) ?? {},
    };

    try {
      await handler(syntheticEvent);
      await this.dlqStore.markReplayed(id);
      logger.info({ id, topic: entry.topic }, 'Successfully replayed DLQ event');
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ id, err }, 'Failed to replay DLQ event');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Lists inspectable DLQ entries.
   */
  async listDlqEntries(filter?: {
    topic?: string;
    status?: string;
    limit?: number;
  }): Promise<DlqEntryRecord[]> {
    return this.dlqStore.list(filter);
  }

  /**
   * Retrieves DLQ depth (unresolved/pending items) with alert check.
   */
  async getDlqDepth(topic?: string): Promise<number> {
    return this.dlqStore.getDepth(topic);
  }
}
