import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notification: { findMany: vi.fn(), deleteMany: vi.fn() },
  authChallenge: { findMany: vi.fn(), deleteMany: vi.fn() },
  webhookDelivery: { findMany: vi.fn(), deleteMany: vi.fn() },
  analyticsDaily: { findMany: vi.fn(), deleteMany: vi.fn() },
  eventLog: { findMany: vi.fn(), deleteMany: vi.fn() },
  eventLogArchive: { createMany: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    notification: mocks.notification,
    authChallenge: mocks.authChallenge,
    webhookDelivery: mocks.webhookDelivery,
    analyticsDaily: mocks.analyticsDaily,
    eventLog: mocks.eventLog,
    eventLogArchive: mocks.eventLogArchive,
    $transaction: mocks.transaction,
  },
  prismaIncludingDeleted: {
    notification: mocks.notification,
  },
}));

vi.mock('../common/observability/metrics.js', () => ({
  recordRetentionPruned: vi.fn(),
}));

import { runRetentionPrune } from './retention.worker.js';

describe('runRetentionPrune', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of [mocks.notification, mocks.authChallenge, mocks.webhookDelivery, mocks.analyticsDaily, mocks.eventLog]) {
      model.findMany.mockResolvedValue([]);
      model.deleteMany.mockResolvedValue({ count: 0 });
    }
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => callback({
      eventLog: mocks.eventLog,
      eventLogArchive: mocks.eventLogArchive,
    }));
    mocks.eventLogArchive.createMany.mockResolvedValue({ count: 0 });
  });

  it('prunes eligible rows and preserves rows excluded by the retention predicate', async () => {
    mocks.notification.findMany
      .mockResolvedValueOnce([{ id: 'old-notification' }])
      .mockResolvedValueOnce([]);
    mocks.notification.deleteMany.mockResolvedValueOnce({ count: 1 });

    const result = await runRetentionPrune(new Date('2026-08-26T00:00:00.000Z'), 10);

    expect(result.pruned.Notification).toBe(1);
    expect(mocks.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdAt: { lt: new Date('2026-05-28T00:00:00.000Z') } },
      take: 10,
    }));
    expect(mocks.notification.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-notification'] } },
    });
  });

  it('never requests or deletes more than the configured batch size', async () => {
    mocks.notification.findMany
      .mockResolvedValueOnce(Array.from({ length: 3 }, (_, index) => ({ id: `n-${index}` })))
      .mockResolvedValueOnce([]);
    mocks.notification.deleteMany.mockResolvedValueOnce({ count: 3 });

    await runRetentionPrune(new Date('2026-08-26T00:00:00.000Z'), 3);

    expect(mocks.notification.findMany.mock.calls[0][0].take).toBe(3);
    expect(mocks.notification.deleteMany.mock.calls[0][0].where.id.in).toHaveLength(3);
  });

  it('archives event logs before deleting their bounded batch', async () => {
    const eventLog = {
      id: 'event-1',
      topic: 'tip_sent',
      ledger: 42,
      txHash: 'tx-1',
      data: { amount: '10' },
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    mocks.eventLog.findMany.mockResolvedValueOnce([eventLog]).mockResolvedValueOnce([]);

    await runRetentionPrune(new Date('2026-08-26T00:00:00.000Z'), 10);

    expect(mocks.eventLogArchive.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ sourceId: 'event-1' })],
      skipDuplicates: true,
    }));
    expect(mocks.eventLog.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['event-1'] } } });
  });
});