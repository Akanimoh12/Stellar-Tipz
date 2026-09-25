import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPreferenceFindUnique, mockNotificationCreate, mockEmit } = vi.hoisted(() => ({
  mockPreferenceFindUnique: vi.fn(),
  mockNotificationCreate: vi.fn(),
  mockEmit: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    notificationPreference: { findUnique: mockPreferenceFindUnique },
    notification: { create: mockNotificationCreate },
  },
}));

vi.mock('../../realtime/index.js', () => ({ emitNotificationCreated: mockEmit }));

import { createSystemNotification } from './notifications.service.js';

describe('createSystemNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationCreate.mockResolvedValue({
      id: 'notification-1',
      type: 'subscription_charge_failed',
      payload: { reason: 'Insufficient balance' },
      readAt: null,
      createdAt: new Date('2026-09-25T12:00:00.000Z'),
    });
  });

  it('persists and emits mandatory charge-failure notifications without preference gating', async () => {
    await createSystemNotification('tipper-id', 'subscription_charge_failed', {
      reason: 'Insufficient balance',
    });

    expect(mockPreferenceFindUnique).not.toHaveBeenCalled();
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: {
        userId: 'tipper-id',
        type: 'subscription_charge_failed',
        payload: { reason: 'Insufficient balance' },
        deliveries: { create: { userId: 'tipper-id', channel: 'in_app', status: 'delivered' } },
      },
    });
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'tipper-id',
        type: 'subscription_charge_failed',
      }),
    );
  });
});
