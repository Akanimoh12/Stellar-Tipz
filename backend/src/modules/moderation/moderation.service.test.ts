import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAuditCreate,
  mockAppealFindFirst,
  mockAppealCreate,
  mockAppealFindMany,
  mockAppealFindUnique,
  mockAppealUpdateMany,
} = vi.hoisted(() => ({
  mockAuditCreate: vi.fn(),
  mockAppealFindFirst: vi.fn(),
  mockAppealCreate: vi.fn(),
  mockAppealFindMany: vi.fn(),
  mockAppealFindUnique: vi.fn(),
  mockAppealUpdateMany: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    auditLog: { create: mockAuditCreate },
    moderationAppeal: {
      findFirst: mockAppealFindFirst,
      create: mockAppealCreate,
      findMany: mockAppealFindMany,
      findUnique: mockAppealFindUnique,
      updateMany: mockAppealUpdateMany,
    },
  },
}));

import {
  createModerationAppeal,
  createModerationReport,
  listModerationAppeals,
  reviewModerationAppeal,
} from './moderation.service.js';

describe('moderation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditCreate.mockResolvedValue({
      id: 'report-1',
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
    });
    mockAppealFindFirst.mockResolvedValue(null);
    mockAppealCreate.mockResolvedValue({
      id: 'appeal-1',
      appellantId: 'user-1',
      moderationActionId: 'action-1',
      reason: 'The action was mistaken',
      details: null,
      status: 'pending',
      decision: null,
      reviewNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    });
  });

  it('persists an auditable report and returns a stable API shape', async () => {
    const result = await createModerationReport('reporter-1', {
      targetType: 'profile',
      targetId: 'profile-1',
      reason: 'impersonation',
      details: 'Uses a copied display name',
    });

    expect(result).toEqual({
      id: 'report-1',
      status: 'received',
      createdAt: '2026-01-02T03:04:05.000Z',
    });
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: 'reporter-1',
        action: 'moderation.report.created',
        target: 'profile:profile-1',
        metadata: expect.objectContaining({
          reporterId: 'reporter-1',
          reason: 'impersonation',
        }),
      }),
    });
  });

  it('keeps optional details absent from the audit payload when omitted', async () => {
    await createModerationReport('reporter-1', {
      targetType: 'tip',
      targetId: 'tip-1',
      reason: 'spam',
    });

    const call = mockAuditCreate.mock.calls[0]![0];
    expect(call.data.metadata).toMatchObject({ targetType: 'tip', targetId: 'tip-1', reason: 'spam' });
    expect(call.data.metadata).not.toHaveProperty('details');
  });

  it('creates an appeal for the authenticated user and rejects duplicates', async () => {
    await expect(createModerationAppeal('user-1', {
      moderationActionId: 'action-1',
      reason: 'The action was mistaken',
    })).resolves.toMatchObject({ status: 'pending', appellantId: 'user-1' });
    expect(mockAppealCreate).toHaveBeenCalledWith({
      data: {
        appellantId: 'user-1',
        moderationActionId: 'action-1',
        reason: 'The action was mistaken',
        details: undefined,
      },
    });

    mockAppealFindFirst.mockResolvedValueOnce({ id: 'appeal-1' });
    await expect(createModerationAppeal('user-1', {
      moderationActionId: 'action-1',
      reason: 'A second appeal',
    })).rejects.toThrow('An appeal has already been submitted');
    expect(mockAppealCreate).toHaveBeenCalledOnce();
  });

  it('filters appeals for administrator review and records the decision', async () => {
    const pending = {
      id: 'appeal-1',
      appellantId: 'user-1',
      moderationActionId: 'action-1',
      status: 'pending',
    };
    const reviewed = { ...pending, status: 'overturned', decision: 'overturned' };
    mockAppealFindMany.mockResolvedValue([pending]);
    mockAppealFindUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce(reviewed);
    mockAppealUpdateMany.mockResolvedValue({ count: 1 });

    await expect(listModerationAppeals('pending')).resolves.toEqual([pending]);
    expect(mockAppealFindMany).toHaveBeenCalledWith({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    await expect(reviewModerationAppeal('appeal-1', 'admin-1', {
      decision: 'overturned',
      notes: 'Evidence was incomplete',
    })).resolves.toEqual(reviewed);
    expect(mockAppealUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'appeal-1', status: 'pending' },
      data: expect.objectContaining({
        status: 'overturned',
        decision: 'overturned',
        reviewedBy: 'admin-1',
        reviewNotes: 'Evidence was incomplete',
      }),
    }));
    expect(mockAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actor: 'admin-1',
        action: 'moderation.appeal.reviewed',
        target: 'appeal-1',
      }),
    }));
  });
});
