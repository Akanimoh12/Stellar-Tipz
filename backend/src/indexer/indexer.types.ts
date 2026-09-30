export interface IndexedEvent {
  id: string;
  topic: string;
  ledger: number;
  txHash: string;
  contractId: string;
  data: Record<string, unknown>;
}

export interface GetEventsFilter {
  contractIds?: string[];
  limit?: number;
}

export type IndexerStatus =
  | { state: 'stopped' }
  | { state: 'running'; currentLedger: number; targetLedger: number }
  | { state: 'error'; message: string };

export function parseEventTopic(event: { topic: unknown[] }): string {
  if (event.topic.length === 0) return 'unknown';
  const first = event.topic[0];
  if (first && typeof first === 'object' && 'sym' in (first as Record<string, unknown>)) {
    const sym = (first as Record<string, unknown>).sym;
    if (typeof sym === 'string') return sym;
  }
  return String(first ?? 'unknown');
}
