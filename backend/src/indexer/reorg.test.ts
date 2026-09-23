import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Checkpoint } from './ledger-checkpoint.store.js';

const { mockTx, mockGetRecent, mockDeleteCheckpointsAbove, mockNoteReorg, mockGetLedgerHash } =
  vi.hoisted(() => ({
    mockTx: vi.fn(),
    mockGetRecent: vi.fn(),
    mockDeleteCheckpointsAbove: vi.fn(),
    mockNoteReorg: vi.fn(),
    mockGetLedgerHash: vi.fn(),
  }));

vi.mock('../db/prisma.js', () => ({ prisma: { $transaction: mockTx } }));
vi.mock('./sorobanClient.js', () => ({ getLedgerHash: mockGetLedgerHash }));
vi.mock('./ledger-checkpoint.store.js', () => ({
  getRecentCheckpoints: mockGetRecent,
  deleteCheckpointsAbove: mockDeleteCheckpointsAbove,
}));
vi.mock('./monitor.js', () => ({ noteReorg: mockNoteReorg }));

import { detectReorg, rollbackToLedger, checkAndHandleReorg } from './reorg.js';

/**
 * A canonical chain: ledger N has hash `h<N>`. A fixture "reorg at depth D"
 * rewrites the last D ledgers to `h<N>-fork`.
 */
function canonicalHash(seq: number): string {
  return `h${seq}`;
}
function chainWithReorgAtDepth(head: number, depth: number): (seq: number) => Promise<string | null> {
  const forkLedger = head - depth;
  return async (seq: number) => (seq > forkLedger ? `h${seq}-fork` : canonicalHash(seq));
}
/** Checkpoints the indexer stored for the *pre-reorg* canonical chain, newest first. */
function storedCheckpoints(head: number, window: number): Checkpoint[] {
  return Array.from({ length: window }, (_, i) => ({
    ledger: head - i,
    ledgerHash: canonicalHash(head - i),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('detectReorg — fixtures at various depths', () => {
  it('no reorg: every stored hash still matches the chain', async () => {
    const checkpoints = storedCheckpoints(100, 20);
    const res = await detectReorg(checkpoints, async (s) => canonicalHash(s));
    expect(res.reorged).toBe(false);
    expect(res.forkLedger).toBe(100); // newest still matches
  });

  it('shallow reorg (depth 1): fork at head-1, only the tip diverged', async () => {
    const checkpoints = storedCheckpoints(100, 20);
    const res = await detectReorg(checkpoints, chainWithReorgAtDepth(100, 1));
    expect(res.reorged).toBe(true);
    expect(res.forkLedger).toBe(99);
    expect(res.divergedAt).toBe(100);
  });

  it('reorg at depth 5: fork at head-5', async () => {
    const checkpoints = storedCheckpoints(100, 20);
    const res = await detectReorg(checkpoints, chainWithReorgAtDepth(100, 5));
    expect(res.reorged).toBe(true);
    expect(res.forkLedger).toBe(95);
    expect(res.divergedAt).toBe(100);
  });

  it('reorg deeper than the retained window: roll back below the whole window', async () => {
    const checkpoints = storedCheckpoints(100, 10); // window covers 91..100
    const res = await detectReorg(checkpoints, chainWithReorgAtDepth(100, 15)); // fork at 85
    expect(res.reorged).toBe(true);
    expect(res.forkLedger).toBe(90); // oldest checkpoint (91) - 1
  });

  it('an inconclusive lookup (Horizon 404 -> null) is skipped, older checkpoints still checked', async () => {
    const checkpoints = storedCheckpoints(100, 5);
    const getHash = async (s: number): Promise<string | null> => {
      if (s === 100) return null; // pruned / unavailable
      return canonicalHash(s);
    };
    const res = await detectReorg(checkpoints, getHash);
    expect(res.reorged).toBe(false);
    expect(res.forkLedger).toBe(99);
  });
});

describe('rollbackToLedger', () => {
  it('deletes refunds, tips, event log and checkpoints above the fork and resets the cursor', async () => {
    const tx = {
      refund: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      tip: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      eventLog: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      indexerCursor: { upsert: vi.fn().mockResolvedValue({}) },
    };
    mockTx.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));

    const result = await rollbackToLedger('tip_events', 95);

    expect(result).toEqual({ eventLog: 3, tips: 2, refunds: 1 });
    expect(tx.refund.deleteMany).toHaveBeenCalledWith({ where: { tip: { ledger: { gt: 95 } } } });
    expect(tx.tip.deleteMany).toHaveBeenCalledWith({ where: { ledger: { gt: 95 } } });
    expect(tx.eventLog.deleteMany).toHaveBeenCalledWith({ where: { ledger: { gt: 95 } } });
    expect(mockDeleteCheckpointsAbove).toHaveBeenCalledWith('tip_events', 95, tx);
    expect(tx.indexerCursor.upsert).toHaveBeenCalledWith({
      where: { topic: 'tip_events' },
      create: { topic: 'tip_events', lastLedger: 95 },
      update: { lastLedger: 95 },
    });
  });
});

describe('checkAndHandleReorg', () => {
  const tx = {
    refund: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    tip: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
    eventLog: { deleteMany: vi.fn().mockResolvedValue({ count: 9 }) },
    indexerCursor: { upsert: vi.fn().mockResolvedValue({}) },
  };

  beforeEach(() => {
    mockTx.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  });

  it('is a no-op when there are no checkpoints yet', async () => {
    mockGetRecent.mockResolvedValue([]);
    expect(await checkAndHandleReorg('tip_events')).toBe(false);
    expect(mockNoteReorg).not.toHaveBeenCalled();
  });

  it('is a no-op when the stored hashes still match the chain', async () => {
    mockGetRecent.mockResolvedValue(storedCheckpoints(100, 10));
    mockGetLedgerHash.mockImplementation(async (s: number) => canonicalHash(s));
    expect(await checkAndHandleReorg('tip_events')).toBe(false);
    expect(mockNoteReorg).not.toHaveBeenCalled();
  });

  it('rolls back and alerts on a real reorg', async () => {
    mockGetRecent.mockResolvedValue(storedCheckpoints(100, 20));
    mockGetLedgerHash.mockImplementation(chainWithReorgAtDepth(100, 5));

    expect(await checkAndHandleReorg('tip_events')).toBe(true);
    expect(mockNoteReorg).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'tip_events', forkLedger: 95 }),
    );
  });
});
