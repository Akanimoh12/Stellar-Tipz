import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuditCreate } = vi.hoisted(() => ({ mockAuditCreate: vi.fn() }));

vi.mock('../../db/prisma.js', () => ({
  prisma: { auditLog: { create: mockAuditCreate } },
}));

import { createModerationReport } from './moderation.service.js';

describe('moderation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditCreate.mockResolvedValue({
      id: 'report-1',
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
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
});
