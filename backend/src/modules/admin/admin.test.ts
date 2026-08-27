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
    user: {
      count: mockUserCount,
    },
    tip: {
      count: mockTipCount,
      aggregate: mockTipAggregate,
    },
    subscription: {
      count: mockSubscriptionCount,
    },
    refund: {
      count: mockRefundCount,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}));

const jwt = await import('jsonwebtoken');

function mockAuth(userId = 'user-1', role = 'admin'): void {
  (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
    sub: userId,
    role,
    scopes: [],
  });
}

describe('GET /api/v1/admin/audit-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without authorization', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/admin/audit-logs');

    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockAuth('user-1', 'user');
    const app = createApp();
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
  });

  it('returns audit logs for admin users', async () => {
    mockAuth('admin-1', 'admin');
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: 'log-1',
        actor: 'admin-1',
        action: 'suspend_user',
        target: 'user-1',
        metadata: { reason: 'spam' },
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].action).toBe('suspend_user');
  });

  it('filters audit logs by action', async () => {
    mockAuth('admin-1', 'admin');
    mockAuditLogFindMany.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/admin/audit-logs?action=suspend_user')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: 'suspend_user' },
      }),
    );
  });

  it('uses default pagination values', async () => {
    mockAuth('admin-1', 'admin');
    mockAuditLogFindMany.mockResolvedValue([]);

    const app = createApp();
    await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', 'Bearer valid-token');

    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      }),
    );
  });
});

describe('GET /api/v1/admin/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without authorization', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/admin/stats');

    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockAuth('user-1', 'user');
    const app = createApp();
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
  });

  it('returns platform statistics', async () => {
    mockAuth('admin-1', 'admin');
    mockUserCount.mockResolvedValueOnce(100); // totalUsers
    mockUserCount.mockResolvedValueOnce(10); // totalCreators
    mockTipCount.mockResolvedValue(500);
    mockTipAggregate.mockResolvedValue({
      _sum: { amountStroops: BigInt(1_000_000_000) },
    });
    mockUserCount.mockResolvedValueOnce(50); // activeUsers
    mockSubscriptionCount.mockResolvedValue(25);
    mockRefundCount.mockResolvedValue(5);

    const app = createApp();
    const res = await request(app)
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
    expect(res.body.data.totalTipAmountStroops).toBe('1000000000');
  });

  it('handles zero tips gracefully', async () => {
    mockAuth('admin-1', 'admin');
    mockUserCount.mockResolvedValueOnce(10);
    mockUserCount.mockResolvedValueOnce(2);
    mockTipCount.mockResolvedValue(0);
    mockTipAggregate.mockResolvedValue({ _sum: { amountStroops: null } });
    mockUserCount.mockResolvedValueOnce(5);
    mockSubscriptionCount.mockResolvedValue(0);
    mockRefundCount.mockResolvedValue(0);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.averageTipAmount).toBe('0');
  });
});

describe('POST /api/v1/admin/audit-log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without authorization', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/audit-log')
      .send({ action: 'test', resource: 'test' });

    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockAuth('user-1', 'user');
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/audit-log')
      .set('Authorization', 'Bearer valid-token')
      .send({ action: 'test', resource: 'test' });

    expect(res.status).toBe(403);
  });

  it('creates an audit log entry', async () => {
    mockAuth('admin-1', 'admin');
    mockAuditLogCreate.mockResolvedValue({
      id: 'log-1',
      actor: 'admin-1',
      action: 'suspend_user',
      target: 'user-1',
      metadata: { reason: 'spam' },
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/admin/audit-log')
      .set('Authorization', 'Bearer valid-token')
      .send({
        action: 'suspend_user',
        target: 'user-1',
        metadata: { reason: 'spam' },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.action).toBe('suspend_user');
  });
});
