import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import {
  listNotifications,
  getNotification,
  markAsRead,
  markAllAsRead,
} from './notifications.service.js';

const { mockFindMany, mockCount, mockFindFirst, mockUpdate, mockUpdateMany } = vi.hoisted(
  () => ({
    mockFindMany: vi.fn(),
    mockCount: vi.fn(),
    mockFindFirst: vi.fn(),
    mockUpdate: vi.fn(),
    mockUpdateMany: vi.fn(),
  }),
);

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    notification: {
      findMany: mockFindMany,
      count: mockCount,
      findFirst: mockFindFirst,
      update: mockUpdate,
      updateMany: mockUpdateMany,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('../../db/redis.js', () => ({
  redis: {
    on: vi.fn(),
  },
}));

function mockAuth() {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { userId: 'user-1', role: 'user', scopes: [] },
    'test-secret-key-for-testing',
    { expiresIn: '1h' },
  );
  return token;
}

describe('listNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it('returns paginated notifications for the user', async () => {
    const createdAt = new Date('2026-07-24T12:00:00.000Z');
    mockFindMany.mockResolvedValue([
      {
        id: 'notif-1',
        type: 'tip_received',
        payload: { amount: '100', from: 'alice' },
        readAt: null,
        createdAt,
      },
    ]);
    mockCount.mockResolvedValue(1);

    const result = await listNotifications('user-1', false, 20, 0);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe('tip_received');
    expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 1, hasMore: false });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('filters by unread only', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listNotifications('user-1', true, 20, 0);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', deletedAt: null, readAt: null },
      }),
    );
  });

  it('applies limit and offset', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(5);

    const result = await listNotifications('user-1', false, 2, 1);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, take: 2 }),
    );
    expect(result.pagination.hasMore).toBe(true);
  });
});

describe('getNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a notification owned by the user', async () => {
    const createdAt = new Date('2026-07-24T12:00:00.000Z');
    mockFindFirst.mockResolvedValue({
      id: 'notif-1',
      type: 'tip_received',
      payload: {},
      readAt: null,
      createdAt,
    });

    const result = await getNotification('user-1', 'notif-1');

    expect(result.id).toBe('notif-1');
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'notif-1', userId: 'user-1', deletedAt: null },
    });
  });

  it('throws NotFoundError when not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(getNotification('user-1', 'unknown')).rejects.toThrow('Notification not found');
  });
});

describe('markAsRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a notification as read and returns it', async () => {
    const createdAt = new Date('2026-07-24T12:00:00.000Z');
    mockFindFirst.mockResolvedValue({
      id: 'notif-1',
      type: 'tip_received',
      payload: {},
      readAt: null,
      createdAt,
    });
    const readAt = new Date('2026-07-25T12:00:00.000Z');
    mockUpdate.mockResolvedValue({
      id: 'notif-1',
      type: 'tip_received',
      payload: {},
      readAt,
      createdAt,
    });

    const result = await markAsRead('user-1', 'notif-1');

    expect(result.readAt).toBe(readAt.toISOString());
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: { readAt: expect.any(Date) },
    });
  });

  it('throws NotFoundError for unknown notification', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(markAsRead('user-1', 'unknown')).rejects.toThrow('Notification not found');
  });

  it('throws NotFoundError for notification owned by another user', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(markAsRead('user-2', 'notif-1')).rejects.toThrow('Notification not found');
  });
});

describe('markAllAsRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks all unread notifications as read for the user', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });

    const result = await markAllAsRead('user-1');

    expect(result.count).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null, deletedAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe('GET /api/v1/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/notifications');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 with notifications for authenticated user', async () => {
    const createdAt = new Date('2026-07-24T12:00:00.000Z');
    mockFindMany.mockResolvedValue([
      {
        id: 'notif-1',
        type: 'tip_received',
        payload: { amount: '100' },
        readAt: null,
        createdAt,
      },
    ]);
    mockCount.mockResolvedValue(1);

    const app = createApp();
    const token = mockAuth();
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by unreadOnly query param', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const app = createApp();
    const token = mockAuth();
    await request(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${token}`);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ readAt: null }),
      }),
    );
  });
});

describe('GET /api/v1/notifications/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/notifications/notif-1');

    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown notification', async () => {
    mockFindFirst.mockResolvedValue(null);

    const app = createApp();
    const token = mockAuth();
    const res = await request(app)
      .get('/api/v1/notifications/unknown')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks notification as read', async () => {
    const createdAt = new Date('2026-07-24T12:00:00.000Z');
    mockFindFirst.mockResolvedValue({
      id: 'notif-1',
      type: 'tip_received',
      payload: {},
      readAt: null,
      createdAt,
    });
    const readAt = new Date('2026-07-25T12:00:00.000Z');
    mockUpdate.mockResolvedValue({
      id: 'notif-1',
      type: 'tip_received',
      payload: {},
      readAt,
      createdAt,
    });

    const app = createApp();
    const token = mockAuth();
    const res = await request(app)
      .patch('/api/v1/notifications/notif-1/read')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.readAt).toBe(readAt.toISOString());
  });
});

describe('POST /api/v1/notifications/read-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks all as read', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });

    const app = createApp();
    const token = mockAuth();
    const res = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/notifications/read-all');

    expect(res.status).toBe(401);
  });
});
