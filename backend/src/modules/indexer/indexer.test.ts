import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IndexerService,
  IndexerEvent,
  InMemoryDeadLetterStore,
  dlqMetrics,
  withRetry,
} from './index.js';

describe('Indexer Dead Letter Queue (#1262)', () => {
  let dlqStore: InMemoryDeadLetterStore;
  let indexer: IndexerService;

  beforeEach(() => {
    dlqStore = new InMemoryDeadLetterStore();
    indexer = new IndexerService({
      dlqStore,
      retryOptions: {
        maxAttempts: 3,
        initialDelayMs: 10,
        backoffFactor: 1.5,
      },
    });
  });

  it('successfully processes normal events without DLQ entry', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const event: IndexerEvent = {
      id: 'evt_1',
      topic: 'tip_created',
      ledger: 100,
      data: { amount: 50 },
    };

    const result = await indexer.processEvent(event, handler);
    expect(result.success).toBe(true);
    expect(result.movedToDlq).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);

    const cursor = await indexer.getCursor('tip_created');
    expect(cursor).toBe(100);

    const depth = await indexer.getDlqDepth('tip_created');
    expect(depth).toBe(0);
  });

  it('retries transient failures and succeeds on subsequent attempt', async () => {
    let callCount = 0;
    const handler = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Temporary network glitch');
      }
    });

    const event: IndexerEvent = {
      id: 'evt_transient',
      topic: 'tip_created',
      ledger: 101,
      data: { amount: 75 },
    };

    const result = await indexer.processEvent(event, handler);
    expect(result.success).toBe(true);
    expect(result.movedToDlq).toBe(false);
    expect(callCount).toBe(3);

    const depth = await indexer.getDlqDepth('tip_created');
    expect(depth).toBe(0);
  });

  it('moves permanently failing event to DLQ with full error and advances cursor', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Unrecoverable deserialization bug'));
    const event: IndexerEvent = {
      id: 'evt_poison',
      topic: 'tip_created',
      ledger: 102,
      data: { corruptPayload: true },
    };

    const result = await indexer.processEvent(event, handler);
    expect(result.success).toBe(false);
    expect(result.movedToDlq).toBe(true);
    expect(result.error).toContain('Unrecoverable deserialization bug');
    expect(handler).toHaveBeenCalledTimes(3);

    // Cursor must advance past the poisoned event so the pipeline doesn't freeze
    const cursor = await indexer.getCursor('tip_created');
    expect(cursor).toBe(102);

    // DLQ depth should now be 1
    const depth = await indexer.getDlqDepth('tip_created');
    expect(depth).toBe(1);

    // Inspect DLQ entry
    const entries = await indexer.listDlqEntries({ topic: 'tip_created' });
    expect(entries.length).toBe(1);
    expect(entries[0].eventId).toBe('evt_poison');
    expect(entries[0].error).toBe('Unrecoverable deserialization bug');
    expect(entries[0].status).toBe('pending');
    expect(entries[0].attempts).toBe(3);
  });

  it('triggers alert notification when DLQ depth is non-zero', async () => {
    const alertSpy = vi.fn();
    const unsub = dlqMetrics.onNonZeroDepth(alertSpy);

    const handler = vi.fn().mockRejectedValue(new Error('Fatal projection error'));
    const event: IndexerEvent = {
      id: 'evt_alert',
      topic: 'refund_processed',
      ledger: 205,
      data: { refundId: 'ref_99' },
    };

    await indexer.processEvent(event, handler);
    expect(alertSpy).toHaveBeenCalledWith(1, 'refund_processed');

    unsub();
  });

  it('processes a batch of events with mixed success and poisoned events', async () => {
    const handler = vi.fn().mockImplementation(async (evt: IndexerEvent) => {
      if (evt.id === 'evt_bad') {
        throw new Error('Poison pill');
      }
    });

    const events: IndexerEvent[] = [
      { id: 'evt_1', topic: 'tip', ledger: 10, data: {} },
      { id: 'evt_bad', topic: 'tip', ledger: 11, data: {} },
      { id: 'evt_2', topic: 'tip', ledger: 12, data: {} },
    ];

    const result = await indexer.processBatch(events, handler);
    expect(result.processed).toBe(2);
    expect(result.dlqCount).toBe(1);
    expect(result.currentLedger).toBe(12);

    const cursor = await indexer.getCursor('tip');
    expect(cursor).toBe(12);
  });

  it('successfully inspects and replays a DLQ entry after bug fix', async () => {
    // 1. Poison event lands in DLQ
    const failingHandler = vi.fn().mockRejectedValue(new Error('Bug in projection'));
    const event: IndexerEvent = {
      id: 'evt_replayable',
      topic: 'tip_created',
      ledger: 300,
      data: { tipId: 'tip_123', amount: 100 },
    };

    await indexer.processEvent(event, failingHandler);
    const [dlqEntry] = await indexer.listDlqEntries({ topic: 'tip_created' });
    expect(dlqEntry).toBeDefined();
    expect(dlqEntry.status).toBe('pending');

    // 2. Fixed handler replays the DLQ entry
    const fixedHandler = vi.fn().mockResolvedValue(undefined);
    const replayResult = await indexer.replayDlqEntry(dlqEntry.id, fixedHandler);

    expect(replayResult.success).toBe(true);
    expect(fixedHandler).toHaveBeenCalledWith({
      id: 'evt_replayable',
      topic: 'tip_created',
      ledger: 300,
      data: { tipId: 'tip_123', amount: 100 },
    });

    // 3. Status is now replayed
    const updatedEntry = await dlqStore.get(dlqEntry.id);
    expect(updatedEntry?.status).toBe('replayed');
    expect(updatedEntry?.replayedAt).toBeInstanceOf(Date);

    // Pending depth is now 0
    const pendingDepth = await indexer.getDlqDepth('tip_created');
    expect(pendingDepth).toBe(0);
  });

  it('withRetry respects custom maxAttempts and shouldRetry classifier', async () => {
    const errorNonRetryable = new TypeError('Syntax fatal error');
    let attempts = 0;

    await expect(
      withRetry(
        async () => {
          attempts++;
          throw errorNonRetryable;
        },
        {
          maxAttempts: 5,
          shouldRetry: (err) => !(err instanceof TypeError),
        },
      ),
    ).rejects.toThrow(TypeError);

    expect(attempts).toBe(1);
  });
});
