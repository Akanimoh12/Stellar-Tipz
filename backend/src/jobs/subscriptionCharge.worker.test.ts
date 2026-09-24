import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  charge: vi.fn(),
  createTip: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../db/prisma.js', () => ({
  prisma: {
    subscription: { findMany: mocks.findMany, update: mocks.update },
    tip: { create: mocks.createTip },
  },
}));
vi.mock('../db/redis.js', () => ({ redis: {} }));
vi.mock('../modules/subscriptions/subscriptions.service.js', () => ({
  chargeSubscriptionOnChain: mocks.charge,
}));
import { processDueSubscriptions } from './subscriptionCharge.worker.js';
const sub = {
  id: 's1',
  tipper: { stellarAddress: 'GTIPPER' },
  creator: { stellarAddress: 'GCREATOR' },
};
beforeEach(() => vi.resetAllMocks());
describe('subscription keeper', () => {
  it('only selects active due subscriptions', async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await processDueSubscriptions()).toEqual({ processed: 0, failed: 0 });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        nextChargeAt: { lte: expect.any(Date) },
        deletedAt: null,
      },
      include: { tipper: true, creator: true },
    });
  });
  it('submits on-chain without manufacturing a payment or advancing an unconfirmed period', async () => {
    mocks.findMany.mockResolvedValue([sub]);
    expect(await processDueSubscriptions()).toEqual({ processed: 1, failed: 0 });
    expect(mocks.charge).toHaveBeenCalledWith('GTIPPER', 'GCREATOR');
    expect(mocks.createTip).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('continues after an individual failed charge', async () => {
    mocks.findMany.mockResolvedValue([sub, { ...sub, id: 's2' }]);
    mocks.charge
      .mockRejectedValueOnce(new Error('RPC unavailable'))
      .mockResolvedValueOnce(undefined);
    expect(await processDueSubscriptions()).toEqual({ processed: 1, failed: 1 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
