import { describe, expect, it, vi, beforeEach } from 'vitest';
import { processDueSubscriptions } from './subscriptionCharge.worker.js';

const { mockFindMany, mockUpdate, mockChargeOnChain } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockChargeOnChain: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    subscription: {
      findMany: mockFindMany,
      update: mockUpdate,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('../modules/subscriptions/subscriptions.service.js', () => ({
  chargeSubscriptionOnChain: mockChargeOnChain,
  INTERVAL_DAYS: { DAILY: 1, WEEKLY: 7, MONTHLY: 30 },
}));

const tipper = { stellarAddress: 'GTIPPER...' };
const creator = { stellarAddress: 'GCREATOR...' };

describe('processDueSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero counts when no subscriptions are due', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await processDueSubscriptions();

    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', nextChargeAt: { lte: expect.any(Date) }, deletedAt: null },
      include: { tipper: true, creator: true },
    });
    expect(mockChargeOnChain).not.toHaveBeenCalled();
  });

  it('charges every due subscription and advances nextChargeAt', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'sub-1', interval: 'MONTHLY', tipper, creator },
      { id: 'sub-2', interval: 'WEEKLY', tipper, creator },
    ]);
    mockChargeOnChain.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue({});

    const result = await processDueSubscriptions();

    expect(result).toEqual({ processed: 2, failed: 0 });
    expect(mockChargeOnChain).toHaveBeenCalledTimes(2);
    expect(mockChargeOnChain).toHaveBeenCalledWith(tipper.stellarAddress, creator.stellarAddress);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { nextChargeAt: expect.any(Date) },
    });
  });

  it('continues processing when an individual charge fails, and does not advance nextChargeAt for it', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'sub-1', interval: 'MONTHLY', tipper, creator },
      { id: 'sub-2', interval: 'MONTHLY', tipper, creator },
      { id: 'sub-3', interval: 'MONTHLY', tipper, creator },
    ]);
    mockChargeOnChain
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network rejected'))
      .mockResolvedValueOnce(undefined);
    mockUpdate.mockResolvedValue({});

    const result = await processDueSubscriptions();

    expect(result).toEqual({ processed: 2, failed: 1 });
    expect(mockChargeOnChain).toHaveBeenCalledTimes(3);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });
});
