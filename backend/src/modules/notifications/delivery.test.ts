import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  delivery: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
  channel: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  notification: { create: vi.fn() },
}));
vi.mock('../../db/prisma.js', () => {
  const db = {
    notificationDelivery: mocks.delivery,
    notificationChannelState: mocks.channel,
    notification: mocks.notification,
  };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
import { getDeliveryMetrics, queueDelivery, transitionDelivery } from './delivery.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.delivery.findUnique.mockResolvedValue({
    id: 'd1',
    userId: 'u1',
    channel: 'email',
    status: 'queued',
  });
  mocks.delivery.updateMany.mockResolvedValue({ count: 1 });
  mocks.channel.upsert.mockResolvedValue({ consecutiveFailures: 1 });
  mocks.channel.updateMany.mockResolvedValue({ count: 1 });
});
describe('notification delivery tracking', () => {
  it('moves queued to sent then delivered and ignores duplicate receipts', async () => {
    expect((await transitionDelivery('d1', 'sent')).status).toBe('sent');
    mocks.delivery.findUnique.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      channel: 'email',
      status: 'sent',
    });
    await transitionDelivery('d1', 'delivered');
    expect(mocks.channel.upsert.mock.calls[0][0].update).toEqual({ consecutiveFailures: 0 });
    mocks.delivery.findUnique.mockResolvedValue({ id: 'd1', status: 'delivered' });
    await transitionDelivery('d1', 'delivered');
    expect(mocks.delivery.updateMany).toHaveBeenCalledTimes(2);
    await expect(transitionDelivery('d1', 'sent')).rejects.toThrow(
      'Invalid delivery status transition',
    );
  });
  it('requires a reason for failures', async () => {
    await expect(transitionDelivery('d1', 'failed')).rejects.toThrow('failure reason');
    expect(mocks.delivery.updateMany).not.toHaveBeenCalled();
  });
  it('hard bounce immediately disables email and creates a durable in-app notice', async () => {
    await transitionDelivery('d1', 'bounced', 'Mailbox does not exist');
    expect(mocks.delivery.updateMany.mock.calls[0][0].data).toEqual({
      status: 'bounced',
      reason: 'Mailbox does not exist',
    });
    expect(mocks.channel.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      channel: 'email',
      disabledAt: null,
    });
    expect(mocks.notification.create.mock.calls[0][0].data.type).toBe(
      'notification_channel_disabled',
    );
    mocks.channel.findUnique.mockResolvedValue({ disabledAt: new Date() });
    await expect(queueDelivery('u1', 'email')).rejects.toThrow('channel is disabled');
    expect(mocks.delivery.create).not.toHaveBeenCalled();
  });
  it('suppresses a channel after three persistent failures, only notifying once', async () => {
    mocks.channel.upsert.mockResolvedValue({ consecutiveFailures: 3 });
    await transitionDelivery('d1', 'failed', 'Provider unavailable');
    mocks.channel.updateMany.mockResolvedValue({ count: 0 });
    await transitionDelivery('d1', 'failed', 'Provider unavailable');
    expect(mocks.notification.create).toHaveBeenCalledOnce();
  });
  it('does not count a concurrently updated receipt twice', async () => {
    mocks.delivery.updateMany.mockResolvedValue({ count: 0 });
    await expect(transitionDelivery('d1', 'bounced', 'Invalid recipient')).rejects.toThrow(
      'retry receipt',
    );
    expect(mocks.channel.upsert).not.toHaveBeenCalled();
  });
  it('exposes channel counts and delivered/total ratios', async () => {
    mocks.delivery.groupBy.mockResolvedValue([
      { channel: 'email', status: 'delivered', _count: 3 },
      { channel: 'email', status: 'bounced', _count: 1 },
    ]);
    expect((await getDeliveryMetrics()).find((row) => row.channel === 'email')).toMatchObject({
      total: 4,
      deliveryRate: 0.75,
    });
  });
});
