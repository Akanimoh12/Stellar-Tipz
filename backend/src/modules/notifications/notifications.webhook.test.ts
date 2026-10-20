import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findSubscription: vi.fn(),
  updateSubscriptions: vi.fn(),
  createNotification: vi.fn(),
  emitNotificationCreated: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));
vi.mock('../../realtime/index.js', () => ({
  emitNotificationCreated: mocks.emitNotificationCreated,
}));

import { disableWebhookSubscriptionAndNotify } from './notifications.service.js';

const tx = {
  webhookSubscription: {
    findUnique: mocks.findSubscription,
    updateMany: mocks.updateSubscriptions,
  },
  notification: { create: mocks.createNotification },
};

describe('webhook disabled notifications (issue #1278)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.findSubscription.mockResolvedValue({ ownerId: 'owner-1', status: 'ACTIVE' });
    mocks.updateSubscriptions.mockResolvedValue({ count: 1 });
    mocks.createNotification.mockResolvedValue({
      id: 'notification-1',
      type: 'webhook_disabled',
      payload: {
        subscriptionId: 'subscription-1',
        deliveryId: 'delivery-1',
        reason: 'HTTP 400',
      },
      readAt: null,
      createdAt: new Date('2026-09-25T12:00:00.000Z'),
    });
  });

  it('atomically disables an active endpoint and emits a distinct owner notification', async () => {
    const notified = await disableWebhookSubscriptionAndNotify(
      'subscription-1',
      'delivery-1',
      'HTTP 400',
    );

    expect(notified).toBe(true);
    expect(mocks.updateSubscriptions).toHaveBeenCalledWith({
      where: { id: 'subscription-1', status: 'ACTIVE' },
      data: { status: 'DISABLED' },
    });
    expect(mocks.createNotification).toHaveBeenCalledWith({
      data: {
        userId: 'owner-1',
        type: 'webhook_disabled',
        payload: {
          subscriptionId: 'subscription-1',
          deliveryId: 'delivery-1',
          reason: 'HTTP 400',
        },
        deliveries: {
          create: {
            userId: 'owner-1',
            channel: 'in_app',
            status: 'delivered',
          },
        },
      },
    });
    expect(mocks.emitNotificationCreated).toHaveBeenCalledTimes(1);
  });

  it('does not notify again when the subscription is already disabled', async () => {
    mocks.findSubscription.mockResolvedValue({ ownerId: 'owner-1', status: 'DISABLED' });

    const notified = await disableWebhookSubscriptionAndNotify(
      'subscription-1',
      'delivery-2',
      'HTTP 404',
    );

    expect(notified).toBe(false);
    expect(mocks.updateSubscriptions).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.emitNotificationCreated).not.toHaveBeenCalled();
  });
});
