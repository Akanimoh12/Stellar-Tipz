import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import {
  listNotifications,
  getNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  getPreferences,
  updatePreferences,
  createNotification,
} from './notifications.service.js';

const {
  mockFindMany,
  mockCount,
  mockFindFirst,
  mockUpdate,
  mockUpdateMany,
  mockCreate,
  mockPrefFindUnique,
  mockPrefUpsert,
  mockEmitNotificationCreated,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockCreate: vi.fn(),
  mockPrefFindUnique: vi.fn(),
  mockPrefUpsert: vi.fn(),
  mockEmitNotificationCreated: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    notification: {
      findMany: mockFindMany,
      count: mockCount,
      findFirst: mockFindFirst,
      update: mockUpdate,
      updateMany: mockUpdateMany,
      create: mockCreate,
    },
    notificationPreference: {
      findUnique: mockPrefFindUnique,
      upsert: mockPrefUpsert,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('../../db/redis.js', () => ({
  redis: {
    on: vi.fn(),
  },
}));

vi.mock('../../realtime/index.js', () => ({
  emitNotificationCreated: mockEmitNotificationCreated,
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

describe('getUnreadCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the unread, non-deleted count for the user', async () => {
    mockCount.mockResolvedValue(4);

    const result = await getUnreadCount('user-1');

    expect(result).toEqual({ count: 4 });
    expect(mockCount).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null, deletedAt: null },
    });
  });
});

describe('getPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to all-enabled when no preference row exists', async () => {
    mockPrefFindUnique.mockResolvedValue(null);

    const result = await getPreferences('user-1');

    expect(result.tipReceived).toBe(true);
    expect(result.goalReached).toBe(true);
    expect(result.subscriptionCharged).toBe(true);
  });

  it('returns the stored preference row when it exists', async () => {
    const updatedAt = new Date('2026-07-24T12:00:00.000Z');
    mockPrefFindUnique.mockResolvedValue({
      tipReceived: false,
      goalReached: true,
      subscriptionCharged: false,
      updatedAt,
    });

    const result = await getPreferences('user-1');

    expect(result).toEqual({
      tipReceived: false,
      goalReached: true,
      subscriptionCharged: false,
      updatedAt: updatedAt.toISOString(),
    });
  });
});

describe('updatePreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts the preference row with the given patch', async () => {
    const updatedAt = new Date('2026-07-25T12:00:00.000Z');
    mockPrefUpsert.mockResolvedValue({
      tipReceived: false,
      goalReached: true,
      subscriptionCharged: true,
      updatedAt,
    });

    const result = await updatePreferences('user-1', { tipReceived: false });

    expect(result.tipReceived).toBe(false);
    expect(mockPrefUpsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', tipReceived: false },
      update: { tipReceived: false },
    });
  });

  it('upserts the subscriptionCharged preference', async () => {
    const updatedAt = new Date('2026-07-25T12:00:00.000Z');
    mockPrefUpsert.mockResolvedValue({
      tipReceived: true,
      goalReached: true,
      subscriptionCharged: false,
      updatedAt,
    });

    const result = await updatePreferences('user-1', { subscriptionCharged: false });

    expect(result.subscriptionCharged).toBe(false);
    expect(mockPrefUpsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', subscriptionCharged: false },
      update: { subscriptionCharged: false },
    });
  });
});

describe('createNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates and emits a notification when no preference row exists', async () => {
    mockPrefFindUnique.mockResolvedValue(null);
    const createdAt = new Date('2026-07-25T12:00:00.000Z');
    mockCreate.mockResolvedValue({
      id: 'notif-1',
      type: 'tip_received',
      payload: { amount: '100' },
      readAt: null,
      createdAt,
    });

    const result = await createNotification('user-1', 'tip_received', { amount: '100' });

    expect(result).not.toBeNull();
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', type: 'tip_received', payload: { amount: '100' } },
    });
    expect(mockEmitNotificationCreated).toHaveBeenCalledWith({
      id: 'notif-1',
      userId: 'user-1',
      type: 'tip_received',
      payload: { amount: '100' },
      createdAt: createdAt.toISOString(),
    });
  });

  it('skips creation when the user disabled this notification type', async () => {
    mockPrefFindUnique.mockResolvedValue({ tipReceived: false, goalReached: true });

    const result = await createNotification('user-1', 'tip_received', { amount: '100' });

    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEmitNotificationCreated).not.toHaveBeenCalled();
  });

  it('creates when the notification type is still enabled', async () => {
    mockPrefFindUnique.mockResolvedValue({ tipReceived: false, goalReached: true });
    const createdAt = new Date('2026-07-25T12:00:00.000Z');
    mockCreate.mockResolvedValue({
      id: 'notif-2',
      type: 'goal_reached',
      payload: {},
      readAt: null,
      createdAt,
    });

    const result = await createNotification('user-1', 'goal_reached', {});

    expect(result).not.toBeNull();
    expect(mockCreate).toHaveBeenCalled();
  });

  it('creates and emits a subscription_charged notification (#965)', async () => {
    mockPrefFindUnique.mockResolvedValue(null);
    const createdAt = new Date('2026-07-25T12:00:00.000Z');
    mockCreate.mockResolvedValue({
      id: 'notif-3',
      type: 'subscription_charged',
      payload: { tipperId: 'user-2', amountStroops: '500' },
      readAt: null,
      createdAt,
    });

    const result = await createNotification('user-1', 'subscription_charged', {
      tipperId: 'user-2',
      amountStroops: '500',
    });

    expect(result).not.toBeNull();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'subscription_charged',
        payload: { tipperId: 'user-2', amountStroops: '500' },
      },
    });
    expect(mockEmitNotificationCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'notif-3', type: 'subscription_charged' }),
    );
  });

  it('skips creation when the user disabled subscription_charged notifications', async () => {
    mockPrefFindUnique.mockResolvedValue({
      tipReceived: true,
      goalReached: true,
      subscriptionCharged: false,
    });

    const result = await createNotification('user-1', 'subscription_charged', {
      tipperId: 'user-2',
      amountStroops: '500',
    });

    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/notifications/unread-count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the unread count for the authenticated user', async () => {
    mockCount.mockResolvedValue(2);

    const app = createApp();
    const token = mockAuth();
    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/notifications/unread-count');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/notifications/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns default preferences when none are stored', async () => {
    mockPrefFindUnique.mockResolvedValue(null);

    const app = createApp();
    const token = mockAuth();
    const res = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({ tipReceived: true, goalReached: true }),
    );
  });
});

describe('PATCH /api/v1/notifications/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates preferences for the authenticated user', async () => {
    const updatedAt = new Date('2026-07-25T12:00:00.000Z');
    mockPrefUpsert.mockResolvedValue({ tipReceived: false, goalReached: true, updatedAt });

    const app = createApp();
    const token = mockAuth();
    const res = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipReceived: false });

    expect(res.status).toBe(200);
    expect(res.body.data.tipReceived).toBe(false);
  });

  it('returns 400 for an empty request body', async () => {
    const app = createApp();
    const token = mockAuth();
    const res = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/notifications/preferences')
      .send({ tipReceived: false });

    expect(res.status).toBe(401);
  });
});
