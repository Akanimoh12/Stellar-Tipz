/**
 * Every write that can change creator search results must invalidate the
 * affected cached queries (issue #1267). These tests drive the real write
 * paths and assert which names each one invalidates.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInvalidate, db } = vi.hoisted(() => ({
  mockInvalidate: vi.fn(),
  db: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    tip: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    withdrawal: { findMany: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    apiKey: { updateMany: vi.fn() },
    notification: { updateMany: vi.fn() },
    webhookSubscription: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    eventLog: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('./search.cache.js', () => ({ invalidateCreatorSearch: mockInvalidate }));
vi.mock('../../db/prisma.js', () => ({ prisma: db, prismaIncludingDeleted: db }));
vi.mock('../../db/redis.js', () => ({ redis: { del: vi.fn(), on: vi.fn() } }));
vi.mock('../../indexer/realtime-publisher.js', () => ({ publishProjection: vi.fn() }));

const profiles = await import('../profiles/profiles.service.js');
const privacy = await import('../privacy/privacy.service.js');
const { projectEvent } = await import('../../indexer/projections.js');

const stored = {
  id: 'user-1',
  stellarAddress: 'GA1',
  username: 'alice',
  displayName: 'Alice Star',
  deletedAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.tip.count.mockResolvedValue(0);
  db.tip.aggregate.mockResolvedValue({ _sum: { amountStroops: null } });
  db.tip.findMany.mockResolvedValue([]);
  db.withdrawal.findMany.mockResolvedValue([]);
  db.user.findFirst.mockResolvedValue(null);
  db.$transaction.mockResolvedValue([]);
});

describe('profile writes invalidate affected searches', () => {
  it('updateProfile invalidates queries matching the old and the new names', async () => {
    db.user.findUnique.mockResolvedValue(stored);
    db.user.update.mockResolvedValue({ ...stored, username: 'alicia', displayName: 'Alicia' });

    await profiles.updateProfile('user-1', { username: 'alicia', displayName: 'Alicia' });

    expect(mockInvalidate).toHaveBeenCalledWith(['alice', 'Alice Star', 'alicia', 'Alicia']);
  });

  it('deactivateProfile invalidates queries matching the profile', async () => {
    db.user.findUnique.mockResolvedValue(stored);
    db.user.update.mockResolvedValue({ ...stored, deletedAt: new Date() });

    await profiles.deactivateProfile('user-1');

    expect(mockInvalidate).toHaveBeenCalledWith(['alice', 'Alice Star']);
    // Invalidation runs after the write committed.
    expect(db.user.update.mock.invocationCallOrder[0]).toBeLessThan(
      mockInvalidate.mock.invocationCallOrder[0],
    );
  });

  it('reactivateProfile invalidates queries matching the profile', async () => {
    db.user.findUnique.mockResolvedValue({ ...stored, deletedAt: new Date() });
    db.user.update.mockResolvedValue(stored);

    await profiles.reactivateProfile('user-1');

    expect(mockInvalidate).toHaveBeenCalledWith(['alice', 'Alice Star']);
  });

  it('account deletion invalidates queries matching the profile', async () => {
    db.user.findUnique.mockResolvedValue(stored);

    await privacy.deleteAccount('user-1');

    expect(mockInvalidate).toHaveBeenCalledWith(['alice', 'Alice Star']);
    expect(db.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      mockInvalidate.mock.invocationCallOrder[0],
    );
  });

  it('a failed update does not invalidate anything', async () => {
    db.user.findUnique.mockResolvedValue({ ...stored, deletedAt: new Date() });

    await expect(profiles.updateProfile('user-1', { displayName: 'x' })).rejects.toThrow();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});

describe('indexed registrations invalidate affected searches', () => {
  it('a profile_register event makes the new username findable', async () => {
    db.eventLog.findFirst.mockResolvedValue(null);
    db.eventLog.create.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue(null);
    db.user.upsert.mockResolvedValue({});

    await projectEvent({
      topic: 'profile_register',
      ledger: 10,
      txHash: 'register-tx',
      pagingToken: '10-1',
      value: ['GNEW', 'newcreator'],
    });

    expect(mockInvalidate).toHaveBeenCalledWith([undefined, undefined, 'newcreator']);
    expect(db.user.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      mockInvalidate.mock.invocationCallOrder[0],
    );
  });

  it('a re-registration also invalidates queries for the previous names', async () => {
    db.eventLog.findFirst.mockResolvedValue(null);
    db.eventLog.create.mockResolvedValue({});
    db.user.findUnique.mockResolvedValue({ username: 'oldname', displayName: 'Old Name' });
    db.user.upsert.mockResolvedValue({});

    await projectEvent({
      topic: 'profile_register',
      ledger: 11,
      txHash: 'register-tx-2',
      pagingToken: '11-1',
      value: ['GOLD', 'newname'],
    });

    expect(mockInvalidate).toHaveBeenCalledWith(['oldname', 'Old Name', 'newname']);
  });
});
