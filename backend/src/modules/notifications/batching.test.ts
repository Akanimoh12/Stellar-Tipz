import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  batch: { upsert: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
  preference: { findUnique: vi.fn() },
  notification: { create: vi.fn() },
  emit: vi.fn(),
}));
vi.mock('../../db/prisma.js', () => {
  const db = {
    notificationBatch: mocks.batch,
    notificationPreference: mocks.preference,
    notification: mocks.notification,
  };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
vi.mock('../../realtime/index.js', () => ({ emitNotificationCreated: mocks.emit }));
import { digestSummary, enqueueTipBatch, flushNotificationBatches } from './batching.js';
import { createNotification } from './notifications.service.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.preference.findUnique.mockResolvedValue({
    batchingEnabled: true,
    batchingWindowSeconds: 60,
    tipReceived: true,
  });
  mocks.notification.create.mockResolvedValue({
    id: 'n1',
    userId: 'u1',
    type: 'tip_digest',
    payload: {},
    readAt: null,
    createdAt: new Date('2026-09-24'),
  });
});
describe('notification batching', () => {
  it('groups within the window and starts a new batch at the boundary', async () => {
    for (const seconds of [0, 59, 60])
      await enqueueTipBatch(
        'u1',
        { amountStroops: '15000000' },
        60,
        new Date(Date.UTC(2026, 8, 24, 0, 0, seconds)),
      );
    const ids = mocks.batch.upsert.mock.calls.map(([input]) => input.where.id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(mocks.batch.upsert.mock.calls[0][0].update.totalStroops).toEqual({
      increment: 15000000n,
    });
  });
  it('keeps users and assets in separate digests', async () => {
    const now = new Date();
    await enqueueTipBatch('u1', { amountStroops: '1', tokenCode: 'XLM' }, 60, now);
    await enqueueTipBatch('u2', { amountStroops: '1', tokenCode: 'XLM' }, 60, now);
    await enqueueTipBatch('u1', { amountStroops: '1', tokenCode: 'USDC' }, 60, now);
    expect(new Set(mocks.batch.upsert.mock.calls.map(([input]) => input.where.id)).size).toBe(3);
  });
  it('formats exact digest amounts, including values above Number precision', () => {
    expect(digestSummary(12, 450000000n, 'XLM')).toBe('12 new tips totalling 45 XLM');
    expect(digestSummary(1, 9007199254740993n, 'XLM')).toBe(
      '1 new tip totalling 900719925.4740993 XLM',
    );
  });
  it('batches opted-in tips but preserves immediate delivery when opted out', async () => {
    expect(await createNotification('u1', 'tip_received', { amountStroops: '10' })).toBeNull();
    expect(mocks.batch.upsert).toHaveBeenCalledOnce();
    mocks.preference.findUnique.mockResolvedValue(null);
    expect(await createNotification('u1', 'tip_received', { amountStroops: '10' })).not.toBeNull();
    expect(mocks.notification.create).toHaveBeenCalledOnce();
  });
  it.each(['payout_failed', 'withdrawal_completed', 'security_event'] as const)(
    'never batches urgent %s',
    async (type) => {
      await createNotification('u1', type, {});
      expect(mocks.notification.create).toHaveBeenCalledOnce();
      expect(mocks.batch.upsert).not.toHaveBeenCalled();
    },
  );
  it('flushes the latest aggregate and skips a batch claimed by another worker', async () => {
    mocks.batch.findMany.mockResolvedValue([
      { id: 'b1', userId: 'u1' },
      { id: 'b2', userId: 'u1' },
    ]);
    mocks.batch.delete
      .mockResolvedValueOnce({
        userId: 'u1',
        count: 12,
        totalStroops: 450000000n,
        tokenCode: 'XLM',
      })
      .mockRejectedValueOnce({ code: 'P2025' });
    expect(await flushNotificationBatches(new Date('2026-09-24'))).toBe(1);
    expect(mocks.notification.create.mock.calls[0][0].data.payload.summary).toBe(
      '12 new tips totalling 45 XLM',
    );
    expect(mocks.emit).toHaveBeenCalledOnce();
    expect(mocks.batch.findMany.mock.calls[0][0].where.dueAt).toEqual({
      lte: new Date('2026-09-24'),
    });
  });
});
