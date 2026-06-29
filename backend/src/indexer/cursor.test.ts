import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCursorLedger, setCursorLedger } from './cursor.js';

const { mockFindUnique, mockUpsert } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    indexerCursor: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
    },
  },
}));

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
