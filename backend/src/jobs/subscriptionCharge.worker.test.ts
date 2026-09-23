import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma and redis before importing the worker
vi.mock('../db/prisma.js', () => ({
  prisma: {
    subscription: {
      findMany: vi.fn(),
    },
    tip: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../db/redis.js', () => ({
  redis: {},
}));

vi.mock('../common/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { processDueSubscriptions } from './subscriptionCharge.worker.js';
import { prisma } from '../db/prisma.js';

describe('processDueSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { processed: 0, failed: 0 } when no subscriptions are due', async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([]);

    const result = await processDueSubscriptions();

    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(prisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        nextChargeAt: { lte: expect.any(Date) },
        deletedAt: null,
      },
    });
  });

  it('charges a due subscription and advances nextChargeAt', async () => {
    const sub = {
      id: 'sub_01',
      tipperId: 'user_tipper',
      creatorId: 'user_creator',
      amountStroops: BigInt(1_000_000),
      interval: 'WEEKLY',
      nextChargeAt: new Date('2026-07-20'),
    };

    vi.mocked(prisma.subscription.findMany).mockResolvedValue([sub]);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        tip: { create: vi.fn() },
        subscription: { update: vi.fn() },
      };
      await fn(tx);
      return undefined;
    });

    const result = await processDueSubscriptions();

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('increments failed count when a subscription charge throws', async () => {
    const sub = {
      id: 'sub_fail',
      tipperId: 'user_tipper',
      creatorId: 'user_creator',
      amountStroops: BigInt(500_000),
      interval: 'DAILY',
      nextChargeAt: new Date('2026-07-20'),
    };

    vi.mocked(prisma.subscription.findMany).mockResolvedValue([sub]);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('db error'));

    const result = await processDueSubscriptions();

    expect(result).toEqual({ processed: 0, failed: 1 });
  });

  it('processes multiple subscriptions independently', async () => {
    const subs = [
      { id: 'sub_a', tipperId: 't1', creatorId: 'c1', amountStroops: BigInt(100), interval: 'DAILY', nextChargeAt: new Date() },
      { id: 'sub_b', tipperId: 't2', creatorId: 'c2', amountStroops: BigInt(200), interval: 'WEEKLY', nextChargeAt: new Date() },
    ];

    vi.mocked(prisma.subscription.findMany).mockResolvedValue(subs);
    vi.mocked(prisma.$transaction).mockResolvedValue(undefined);

    const result = await processDueSubscriptions();

    expect(result).toEqual({ processed: 2, failed: 0 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
