import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';

const {
  mockAuditLogFindMany,
  mockAuditLogCreate,
  mockUserCount,
  mockTipCount,
  mockTipAggregate,
  mockSubscriptionCount,
  mockRefundCount,
} = vi.hoisted(() => ({
  mockAuditLogFindMany: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockUserCount: vi.fn(),
  mockTipCount: vi.fn(),
  mockTipAggregate: vi.fn(),
  mockSubscriptionCount: vi.fn(),
  mockRefundCount: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    auditLog: {
      findMany: mockAuditLogFindMany,
      create: mockAuditLogCreate,
    },
    user: { count: mockUserCount },
    tip: { count: mockTipCount, aggregate: mockTipAggregate },
    subscription: { count: mockSubscriptionCount },
    refund: { count: mockRefundCount },
    $disconnect: vi.fn(),
  },
}));

// The global rate limiter talks to Redis on every request; without this the
// whole suite blocks on a connection that never opens.
vi.mock('../../db/redis.js', () => ({
  redis: {
    zcount: vi.fn().mockResolvedValue(0),
    zadd: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}));

const jwt = await import('jsonwebtoken');
const ADDRESS = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';

/**
 * Stubs a verified access token. The payload mirrors AuthPayload, whose
 * subject field is `userId` — that is what the audit trail records as actor.
 */
function mockAuth(userId = 'admin-1', role = 'admin'): void {
  (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
    userId,
    stellarAddress: ADDRESS,
    role,
    scopes: [],
  });
}

const AUDIT_ROW = {
  id: 'log-1',
  actor: 'admin-1',
  action: 'suspend_user',
  target: 'user-1',
  metadata: { reason: 'spam' },
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  // The audit middleware writes after the response flushes; give it a row so
  // the fire-and-forget write resolves cleanly.
  mockAuditLogCreate.mockResolvedValue(AUDIT_ROW);
});

describe('GET /api/v1/admin/audit-logs', () => {
  it('returns 401 without authorization', async () => {
    const res = await request(createApp()).get('/api/v1/admin/audit-logs');

    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockAuth('user-1', 'user');
    const res = await request(createApp())
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
    expect(mockAuditLogFindMany).not.toHaveBeenCalled();
  });

  it('returns audit logs for admin users', async () => {
    mockAuth();
    mockAuditLogFindMany.mockResolvedValue([AUDIT_ROW]);

    const res = await request(createApp())
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].action).toBe('suspend_user');
  });

  it('defaults null metadata to an empty object', async () => {
    mockAuth();
    mockAuditLogFindMany.mockResolvedValue([{ ...AUDIT_ROW, metadata: null }]);

    const res = await request(createApp())
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data[0].metadata).toEqual({});
  });

  it('filters audit logs by action and actor', async () => {
    mockAuth();
    mockAuditLogFindMany.mockResolvedValue([]);

    const res = await request(createApp())
      .get('/api/v1/admin/audit-logs?action=suspend_user&actor=admin-1')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: 'suspend_user', actor: 'admin-1' },
      }),
    );
  });

  it('uses default pagination values', async () => {
    mockAuth();
    mockAuditLogFindMany.mockResolvedValue([]);

    await request(createApp())
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', 'Bearer valid-token');

    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });

  it('rejects an out-of-range limit', async () => {
    mockAuth();

    const res = await request(createApp())
      .get('/api/v1/admin/audit-logs?limit=500')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(mockAuditLogFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/stats', () => {
  function mockStats(): void {
    mockUserCount.mockResolvedValueOnce(100); // totalUsers
    mockUserCount.mockResolvedValueOnce(10); // totalCreators
    mockTipCount.mockResolvedValue(500);
    mockTipAggregate.mockResolvedValue({
      _sum: { amountStroops: BigInt(1_000_000_000) },
    });
    mockUserCount.mockResolvedValueOnce(50); // activeUsersLast30Days
    mockSubscriptionCount.mockResolvedValue(25);
    mockRefundCount.mockResolvedValue(5);
  }

  it('returns 401 without authorization', async () => {
    const res = await request(createApp()).get('/api/v1/admin/stats');

    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockAuth('user-1', 'user');
    const res = await request(createApp())
      .get('/api/v1/admin/stats')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
  });

  it('returns platform statistics', async () => {
    mockAuth();
    mockStats();

    const res = await request(createApp())
      .get('/api/v1/admin/stats')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalUsers: 100,
      totalCreators: 10,
      totalTips: 500,
      totalSubscriptions: 25,
      totalRefunds: 5,
      activeUsersLast30Days: 50,
    });
    // bigint stroops are serialised as a decimal string.
    expect(res.body.data.totalTipAmountStroops).toBe('1000000000');
    expect(res.body.data.averageTipAmount).toBe('2000000');
  });

  it('handles zero tips gracefully', async () => {
    mockAuth();
    mockUserCount.mockResolvedValueOnce(10);
    mockUserCount.mockResolvedValueOnce(2);
    mockTipCount.mockResolvedValue(0);
    mockTipAggregate.mockResolvedValue({ _sum: { amountStroops: null } });
    mockUserCount.mockResolvedValueOnce(5);
    mockSubscriptionCount.mockResolvedValue(0);
    mockRefundCount.mockResolvedValue(0);

    const res = await request(createApp())
      .get('/api/v1/admin/stats')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.averageTipAmount).toBe('0');
    expect(res.body.data.totalTipAmountStroops).toBe('0');
  });
});

describe('POST /api/v1/admin/audit-log', () => {
  it('returns 401 without authorization', async () => {
    const res = await request(createApp())
      .post('/api/v1/admin/audit-log')
      .send({ action: 'test' });

    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockAuth('user-1', 'user');
    const res = await request(createApp())
      .post('/api/v1/admin/audit-log')
      .set('Authorization', 'Bearer valid-token')
      .send({ action: 'test' });

    expect(res.status).toBe(403);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('creates an audit log entry attributed to the calling admin', async () => {
    mockAuth('admin-1', 'admin');

    const res = await request(createApp())
      .post('/api/v1/admin/audit-log')
      .set('Authorization', 'Bearer valid-token')
      .send({ action: 'suspend_user', target: 'user-1', metadata: { reason: 'spam' } });

    expect(res.status).toBe(201);
    expect(res.body.data.action).toBe('suspend_user');
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        actor: 'admin-1',
        action: 'suspend_user',
        target: 'user-1',
        metadata: { reason: 'spam' },
      },
    });
  });

  it('defaults target and metadata when omitted', async () => {
    mockAuth();

    const res = await request(createApp())
      .post('/api/v1/admin/audit-log')
      .set('Authorization', 'Bearer valid-token')
      .send({ action: 'rotate_keys' });

    expect(res.status).toBe(201);
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        actor: 'admin-1',
        action: 'rotate_keys',
        target: null,
        metadata: {},
      },
    });
  });

  it('rejects a body with no action', async () => {
    mockAuth();

    const res = await request(createApp())
      .post('/api/v1/admin/audit-log')
      .set('Authorization', 'Bearer valid-token')
      .send({ target: 'user-1' });

    expect(res.status).toBe(400);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('rejects an empty action', async () => {
    mockAuth();

    const res = await request(createApp())
      .post('/api/v1/admin/audit-log')
      .set('Authorization', 'Bearer valid-token')
      .send({ action: '' });

    expect(res.status).toBe(400);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
});
