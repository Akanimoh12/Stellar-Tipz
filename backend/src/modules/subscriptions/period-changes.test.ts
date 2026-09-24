import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  find: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findUnique: mocks.user },
    subscription: { findUnique: mocks.find, upsert: mocks.upsert, update: mocks.update },
  },
}));
vi.mock('../../common/stellar/rpcClient.js', () => ({ rpcCall: mocks.rpc }));
vi.mock('@stellar/stellar-sdk', () => ({
  Contract: vi.fn(),
  Keypair: {},
  SorobanRpc: {},
  nativeToScVal: vi.fn(),
  Networks: { TESTNET: 'test' },
  TransactionBuilder: { fromXDR: vi.fn() },
}));
import { submitCreateSubscription, submitCancelSubscription } from './subscriptions.service.js';

const nextChargeAt = new Date('2026-10-01T00:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockImplementation(({ where }) =>
    Promise.resolve(
      where.id
        ? { id: 'tipper', stellarAddress: 'GTIPPER' }
        : { id: 'creator', stellarAddress: 'GCREATOR' },
    ),
  );
  mocks.find.mockResolvedValue({
    id: 'sub_tipper_creator',
    tipperId: 'tipper',
    status: 'ACTIVE',
    amountStroops: 10000000n,
    interval: 'WEEKLY',
    nextChargeAt,
    deletedAt: null,
  });
  mocks.rpc.mockResolvedValue({ status: 'PENDING' });
  mocks.upsert.mockResolvedValue({ id: 'sub_tipper_creator', status: 'ACTIVE', nextChargeAt });
  mocks.update.mockResolvedValue({ id: 'sub_tipper_creator', status: 'CANCELLED' });
});

describe('subscription period policy', () => {
  it.each([
    ['20000000', 'WEEKLY'],
    ['5000000', 'WEEKLY'],
    ['10000000', 'MONTHLY'],
  ] as const)(
    'defers amount %s and interval %s without resetting the period',
    async (amount, interval) => {
      await submitCreateSubscription('tipper', 'GCREATOR', amount, interval, 'signed');
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
  it('clears pending changes when cancelled and does not submit a refund', async () => {
    await submitCancelSubscription('tipper', 'GCREATOR', 'signed');
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      status: 'CANCELLED',
      pendingAmountStroops: null,
      pendingInterval: null,
      changeEffectiveAt: null,
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it('does not write a change rejected by the network', async () => {
    mocks.rpc.mockResolvedValue({ status: 'ERROR' });
    await expect(
      submitCreateSubscription('tipper', 'GCREATOR', '20000000', 'MONTHLY', 'signed'),
    ).rejects.toThrow('rejected');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('restarts a cancelled subscription with a new period and clears stale pending terms', async () => {
    mocks.find.mockResolvedValue({ status: 'CANCELLED' });
    await submitCreateSubscription('tipper', 'GCREATOR', '20000000', 'MONTHLY', 'signed');
    expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({
      amountStroops: 20000000n,
      interval: 'MONTHLY',
      nextChargeAt: expect.any(Date),
      pendingInterval: null,
      changeEffectiveAt: null,
    });
  });
});
