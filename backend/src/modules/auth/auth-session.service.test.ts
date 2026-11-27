import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, updateMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    refreshToken: { findMany, updateMany },
  },
}));

import { listSessions, revokeOtherSessions, revokeSession } from './auth-session.service.js';

describe('auth session service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups active refresh tokens by session and marks the current device', async () => {
    findMany.mockResolvedValue([
      {
        sessionId: 'session-current',
        device: 'Chrome on Linux',
        ipAddress: '192.168.1.0',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastUsedAt: new Date('2026-01-03T00:00:00.000Z'),
      },
      {
        sessionId: 'session-current',
        device: 'Chrome on Linux',
        ipAddress: '192.168.1.0',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        lastUsedAt: new Date('2026-01-04T00:00:00.000Z'),
      },
      {
        sessionId: 'session-other',
        device: 'Firefox on Windows',
        ipAddress: '10.0.0.0',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        lastUsedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);

    await expect(listSessions('user-1', 'session-current')).resolves.toEqual([
      {
        id: 'session-current',
        device: 'Chrome on Linux',
        ip: '192.168.1.0',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: '2026-01-04T00:00:00.000Z',
        current: true,
      },
      {
        id: 'session-other',
        device: 'Firefox on Windows',
        ip: '10.0.0.0',
        createdAt: '2026-01-02T00:00:00.000Z',
        lastUsedAt: '2026-01-02T00:00:00.000Z',
        current: false,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      }),
    }));
  });

  it('revokes only the requested active session owned by the user', async () => {
    updateMany.mockResolvedValue({ count: 2 });

    await revokeSession('user-1', 'session-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        sessionId: 'session-1',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('returns not found when a session cannot be revoked', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(revokeSession('user-1', 'other-user-session')).rejects.toThrow(
      'Active session not found',
    );
  });

  it('revokes other sessions without invalidating the current one', async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await revokeOtherSessions('user-1', 'session-current');

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        sessionId: { not: 'session-current' },
      }),
    }));
  });

  it('rejects bulk revocation when the current session is unknown', async () => {
    await expect(revokeOtherSessions('user-1', undefined)).rejects.toThrow(
      'Current session identifier is required',
    );
    expect(updateMany).not.toHaveBeenCalled();
  });
});
