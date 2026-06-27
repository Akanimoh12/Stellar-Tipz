import { SorobanRpc, Contract } from '@stellar/stellar-sdk';
import { config } from '../config/index.js';
import { ApiQueue } from './throttle.js';
import { parseEventTopic } from './indexer.types.js';

export interface SorobanClientOptions {
  rpcUrl?: string;
  requestsPerSecond?: number;
}

export interface ProcessedEvent {
  id: string;
  topic: string;
  ledger: number;
  txHash: string;
  contractId: string;
  value: Record<string, unknown>;
  ledgerClosedAt: string;
}

export class SorobanClient {
  private server: SorobanRpc.Server;
  private queue: ApiQueue;

  constructor(options?: SorobanClientOptions) {
    const rpcUrl = options?.rpcUrl ?? config.stellar.rpcUrl;
    this.server = new SorobanRpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });
    this.queue = new ApiQueue(options?.requestsPerSecond ?? 10);
  }

  async getLatestLedger(): Promise<number> {
    return this.queue.add(async () => {
      const ledger = await this.server.getLatestLedger();
      return ledger.sequence;
    });
  }

  async fetchEvents(
    startLedger: number,
    options?: { contractIds?: string[]; limit?: number; cursor?: string },
  ): Promise<{ events: ProcessedEvent[]; latestLedger: number; cursor: string | null }> {
    return this.queue.add(async () => {
      const filters: SorobanRpc.Api.EventFilter[] = [];
      if (options?.contractIds?.length) {
        filters.push({ contractIds: options.contractIds });
      }

      const response: SorobanRpc.Api.GetEventsResponse = await this.server.getEvents({
        startLedger,
        filters,
        cursor: options?.cursor,
        limit: options?.limit ?? 100,
      });

      const events = response.events
        .filter((e) => e.inSuccessfulContractCall)
        .map((e) => ({
          id: e.id,
          topic: parseEventTopic({ topic: e.topic }),
          ledger: e.ledger,
          txHash: e.txHash,
          contractId: contractIdToString(e.contractId),
          value: { pagingToken: e.pagingToken },
          ledgerClosedAt: e.ledgerClosedAt,
        }));

      const limit = options?.limit ?? 100;
      const nextCursor =
        events.length === limit && events.length > 0
          ? events[events.length - 1].value.pagingToken
          : null;

      return {
        events,
        latestLedger: response.latestLedger,
        cursor: nextCursor,
      };
    });
  }

  destroy(): void {
    this.queue.destroy();
  }

  async getAllEvents(
    startLedger: number,
    options?: { contractIds?: string[]; limit?: number },
  ): Promise<ProcessedEvent[]> {
    const allEvents: ProcessedEvent[] = [];
    let cursor: string | null = null;

    do {
      const result = await this.fetchEvents(startLedger, { ...options, cursor: cursor ?? undefined });
      allEvents.push(...result.events);
      cursor = result.cursor;
    } while (cursor);

    return allEvents;
  }
}

function contractIdToString(id: string | Contract | undefined): string {
  if (!id) return '';
  if (typeof id === 'string') return id;
  return id.toString();
}
