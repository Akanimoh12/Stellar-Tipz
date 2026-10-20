import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockUserFindUnique,
  mockWithdrawalFindMany,
  mockTipFindMany,
  mockAuditCreate,
  mockTransaction,
  mockRefreshTokenUpdateMany,
  mockApiKeyUpdateMany,
  mockNotificationUpdateMany,
  mockWebhookUpdateMany,
  mockUserUpdate,
  mockRedisDel,
  mockInvalidateCreatorSearch,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockWithdrawalFindMany: vi.fn(),
  mockTipFindMany: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockTransaction: vi.fn(),
  mockRefreshTokenUpdateMany: vi.fn(),
  mockApiKeyUpdateMany: vi.fn(),
  mockNotificationUpdateMany: vi.fn(),
  mockWebhookUpdateMany: vi.fn(),
  mockUserUpdate: vi.fn(),
  mockRedisDel: vi.fn(),
  mockInvalidateCreatorSearch: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique, update: mockUserUpdate },
    withdrawal: { findMany: mockWithdrawalFindMany },
    tip: { findMany: mockTipFindMany },
    auditLog: { create: mockAuditCreate },
    refreshToken: { updateMany: mockRefreshTokenUpdateMany },
    apiKey: { updateMany: mockApiKeyUpdateMany },
    notification: { updateMany: mockNotificationUpdateMany },
    webhookSubscription: { updateMany: mockWebhookUpdateMany },
    $transaction: mockTransaction,
  },
}));

vi.mock('../../db/redis.js', () => ({ redis: { del: mockRedisDel } }));
vi.mock('../search/search.cache.js', () => ({
  invalidateCreatorSearch: mockInvalidateCreatorSearch,
}));

import { deleteAccount, exportUserData } from './privacy.service.js';

const user = {
  id: 'user-1',
  stellarAddress: 'GTEST',
  username: 'creator',
  displayName: 'Creator',
  deletedAt: null,
};

describe('privacy service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditCreate.mockResolvedValue({ id: 'audit-1', createdAt: new Date('2026-01-01') });
    mockTransaction.mockResolvedValue([]);
    mockRefreshTokenUpdateMany.mockResolvedValue({ count: 1 });
    mockApiKeyUpdateMany.mockResolvedValue({ count: 1 });
    mockNotificationUpdateMany.mockResolvedValue({ count: 1 });
    mockWebhookUpdateMany.mockResolvedValue({ count: 1 });
    mockUserUpdate.mockResolvedValue(user);
    mockRedisDel.mockResolvedValue(1);
    mockInvalidateCreatorSearch.mockResolvedValue(undefined);
  });

  it('exports portable user data with dates and bigint values serialized', async () => {
    mockUserFindUnique.mockResolvedValue({
      ...user,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      sentTips: [{ amountStroops: 123n }],
    });

    const result = await exportUserData('user-1');

    expect(result.subject).toEqual({ id: 'user-1', stellarAddress: 'GTEST' });
    expect(result.data).toMatchObject({
      createdAt: '2025-01-01T00:00:00.000Z',
      sentTips: [{ amountStroops: '123' }],
    });
    expect(mockAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actor: 'user-1',
        action: 'privacy.data_export.generated',
        target: 'user-1',
      }),
    }));
  });

  it('rejects export requests for missing or already deleted accounts', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...user, deletedAt: new Date() });

    await expect(exportUserData('missing')).rejects.toThrow('Account not found');
    await expect(exportUserData('deleted')).rejects.toThrow('Account not found');
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('soft-deletes the account and returns pending on-chain reconciliation work', async () => {
    mockUserFindUnique.mockResolvedValue(user);
    mockWithdrawalFindMany.mockResolvedValue([{ id: 'wd-1' }]);
    mockTipFindMany.mockResolvedValue([{ id: 'tip-1' }]);

    const result = await deleteAccount('user-1');

    expect(result.reconciliation).toEqual({
      pendingWithdrawals: [{ id: 'wd-1' }],
      pendingTips: [{ id: 'tip-1' }],
      requiresOnChainFollowUp: true,
    });
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockRefreshTokenUpdateMany).toHaveBeenCalledOnce();
    expect(mockApiKeyUpdateMany).toHaveBeenCalledOnce();
    expect(mockNotificationUpdateMany).toHaveBeenCalledOnce();
    expect(mockWebhookUpdateMany).toHaveBeenCalledOnce();
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { deletedAt: expect.any(Date), deactivatedAt: expect.any(Date) },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'privacy.account_deleted' }),
    }));
    expect(mockRedisDel).toHaveBeenCalledWith('profile:GTEST');
    expect(mockInvalidateCreatorSearch).toHaveBeenCalledWith(['creator', 'Creator']);
  });

  it('does not perform deletion work for an unknown account', async () => {
    mockUserFindUnique.mockResolvedValue(null);

    await expect(deleteAccount('missing')).rejects.toThrow('Account not found');
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockRedisDel).not.toHaveBeenCalled();
  });
});
