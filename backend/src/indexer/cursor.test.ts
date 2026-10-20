import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CursorFencedError,
  getCursorLedger,
  getMaxLeaderEpoch,
  setCursorLedger,
} from './cursor.js';

const { mockFindUnique, mockUpsert, mockAggregate, mockQueryRaw, mockTransaction } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpsert: vi.fn(),
  mockAggregate: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../db/prisma.js', () => {
  const client = {
    indexerCursor: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
      aggregate: mockAggregate,
    },
    $queryRaw: mockQueryRaw,
    $transaction: mockTransaction,
  };
  // Interactive transactions run the callback against the same (mocked) client.
  mockTransaction.mockImplementation(async (fn: (tx: typeof client) => Promise<unknown>) => fn(client));
  return { prisma: client };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCursorLedger', () => {
  it('returns null when no cursor row exists', async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await getCursorLedger('tip_sent')).toBeNull();
  });

  it('returns lastLedger from a stored row', async () => {
    mockFindUnique.mockResolvedValue({ topic: 'tip_sent', lastLedger: 42 });
    expect(await getCursorLedger('tip_sent')).toBe(42);
  });

  it('scopes lookup to the given topic', async () => {
    mockFindUnique.mockResolvedValue(null);
    await getCursorLedger('subscription_charged');
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { topic: 'subscription_charged' } });
  });
});

describe('setCursorLedger', () => {
  it('upserts with the correct shape', async () => {
    mockUpsert.mockResolvedValue({});
    await setCursorLedger('tip_sent', 100);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { topic: 'tip_sent' },
      create: { topic: 'tip_sent', lastLedger: 100 },
      update: { lastLedger: 100 },
    });
  });

  it('is idempotent — calling twice with the same ledger upserts twice without error', async () => {
    mockUpsert.mockResolvedValue({});
    await setCursorLedger('tip_sent', 50);
    await setCursorLedger('tip_sent', 50);
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it('advances the cursor to a higher ledger', async () => {
    mockUpsert.mockResolvedValue({});
    await setCursorLedger('tip_sent', 99);
    await setCursorLedger('tip_sent', 100);
    const secondCall = mockUpsert.mock.calls[1][0];
    expect(secondCall.update.lastLedger).toBe(100);
  });
});

describe('setCursorLedger with a leader fence (issue #1263)', () => {
  it('locks the cursor row and records the writer epoch', async () => {
    mockQueryRaw.mockResolvedValue([{ leaderEpoch: 3 }]);
    mockUpsert.mockResolvedValue({});

    await setCursorLedger('tip_events', 120, 3);

    const lockSql = (mockQueryRaw.mock.calls[0][0] as string[]).join('?');
    expect(lockSql).toContain('FOR UPDATE');
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { topic: 'tip_events' },
      create: { topic: 'tip_events', lastLedger: 120, leaderEpoch: 3 },
      update: { lastLedger: 120, leaderEpoch: 3 },
    });
  });

  it('accepts a newer leader and the very first write', async () => {
    mockUpsert.mockResolvedValue({});
    mockQueryRaw.mockResolvedValueOnce([{ leaderEpoch: 3 }]).mockResolvedValueOnce([]);

    await expect(setCursorLedger('tip_events', 130, 4)).resolves.toBeUndefined();
    await expect(setCursorLedger('fresh_topic', 1, 1)).resolves.toBeUndefined();
  });

  it('rejects a deposed leader whose epoch is older than the stored one', async () => {
    mockQueryRaw.mockResolvedValue([{ leaderEpoch: 5 }]);

    await expect(setCursorLedger('tip_events', 999, 4)).rejects.toBeInstanceOf(CursorFencedError);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('getMaxLeaderEpoch', () => {
  it('returns the highest persisted epoch, or 0 when none', async () => {
    mockAggregate.mockResolvedValueOnce({ _max: { leaderEpoch: 9 } });
    mockAggregate.mockResolvedValueOnce({ _max: { leaderEpoch: null } });

    expect(await getMaxLeaderEpoch()).toBe(9);
    expect(await getMaxLeaderEpoch()).toBe(0);
  });
});
