import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { env } from '../../config/env.js';
import { openApiDocument } from '../../docs/openapi.js';
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

/**
 * Signs a test JWT using the same secret the auth middleware verifies against,
 * so requests passing through `requireAuth` actually attach `req.auth`.
 */
function mockAuth(): string {
  return jwt.sign(
    { userId: 'user-1', stellarAddress: 'GABC', role: 'user', scopes: [] },
    env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

const authHeader = (): string => `Bearer ${mockAuth()}`;

// ── listNotifications ─────────────────────────────────────────────────────

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
    expect(result.data[0]).toEqual({
      id: 'notif-1',
      type: 'tip_received',
      payload: { amount: '100', from: 'alice' },
      readAt: null,
      createdAt: createdAt.toISOString(),
    });
    expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 1, hasMore: false });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('always filters out soft-deleted notifications via deletedAt: null', async () => {
    await listNotifications('user-1', false, 20, 0);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
    expect(mockCount).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
    });
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
    expect(mockCount).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null, readAt: null },
    });
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

// ── getNotification ───────────────────────────────────────────────────────

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

  it('filters out soft-deleted notifications', async () => {
    await getNotification('user-1', 'notif-1');

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ deletedAt: null }),
    });
  });

  it('throws NotFoundError when not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(getNotification('user-1', 'unknown')).rejects.toThrow('Notification not found');
  });
});

// ── markAsRead ────────────────────────────────────────────────────────────

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

  it('does not mark soft-deleted notifications even if the id match would otherwise succeed', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(markAsRead('user-1', 'notif-1')).rejects.toThrow('Notification not found');
    expect(mockUpdate).not.toHaveBeenCalled();
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

// ── markAllAsRead ─────────────────────────────────────────────────────────

describe('markAllAsRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks all unread, non-deleted notifications as read for the user', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });

    const result = await markAllAsRead('user-1');

    expect(result.count).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null, deletedAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

// ── getUnreadCount ────────────────────────────────────────────────────────

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

// ── getPreferences ────────────────────────────────────────────────────────

describe('getPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to all-enabled when no preference row exists', async () => {
    mockPrefFindUnique.mockResolvedValue(null);

    const result = await getPreferences('user-1');

    expect(result.tipReceived).toBe(true);
    expect(result.goalReached).toBe(true);
  });

  it('returns the stored preference row when it exists', async () => {
    const updatedAt = new Date('2026-07-24T12:00:00.000Z');
    mockPrefFindUnique.mockResolvedValue({
      tipReceived: false,
      goalReached: true,
      updatedAt,
    });

    const result = await getPreferences('user-1');

    expect(result).toEqual({
      tipReceived: false,
      goalReached: true,
      updatedAt: updatedAt.toISOString(),
    });
  });
});

// ── updatePreferences ─────────────────────────────────────────────────────

describe('updatePreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts the preference row with the given patch', async () => {
    const updatedAt = new Date('2026-07-25T12:00:00.000Z');
    mockPrefUpsert.mockResolvedValue({ tipReceived: false, goalReached: true, updatedAt });

    const result = await updatePreferences('user-1', { tipReceived: false });

    expect(result.tipReceived).toBe(false);
    expect(mockPrefUpsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', tipReceived: false },
      update: { tipReceived: false },
    });
  });

  it('persists both fields when both are provided', async () => {
    const updatedAt = new Date('2026-07-25T12:00:00.000Z');
    mockPrefUpsert.mockResolvedValue({ tipReceived: false, goalReached: false, updatedAt });

    await updatePreferences('user-1', { tipReceived: false, goalReached: false });

    expect(mockPrefUpsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', tipReceived: false, goalReached: false },
      update: { tipReceived: false, goalReached: false },
    });
  });
});

// ── createNotification ────────────────────────────────────────────────────

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

  it('skips creation when the user disabled this notification type (tipReceived=false)', async () => {
    mockPrefFindUnique.mockResolvedValue({ tipReceived: false, goalReached: true });

    const result = await createNotification('user-1', 'tip_received', { amount: '100' });

    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEmitNotificationCreated).not.toHaveBeenCalled();
  });

  it('skips creation when the user disabled goal_reached notifications', async () => {
    mockPrefFindUnique.mockResolvedValue({ tipReceived: true, goalReached: false });

    const result = await createNotification('user-1', 'goal_reached', { goalId: 'g-1' });

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
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', type: 'goal_reached', payload: {} },
    });
  });

  it('emits in the same shape consumed by the realtime layer (no internal readAt)', async () => {
    mockPrefFindUnique.mockResolvedValue(null);
    const createdAt = new Date('2026-07-25T12:00:00.000Z');
    mockCreate.mockResolvedValue({
      id: 'notif-3',
      type: 'tip_received',
      payload: { ok: true },
      readAt: null,
      createdAt,
    });

    await createNotification('user-1', 'tip_received', { ok: true });

    const [call] = mockEmitNotificationCreated.mock.calls[0] as [Record<string, unknown>];
    expect(call).not.toHaveProperty('readAt');
    expect(call).toEqual({
      id: 'notif-3',
      userId: 'user-1',
      type: 'tip_received',
      payload: { ok: true },
      createdAt: createdAt.toISOString(),
    });
  });
});

// ── GET /api/v1/notifications ─────────────────────────────────────────────

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

  it('returns 200 with paginated notifications for authenticated user', async () => {
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
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: 'notif-1',
      type: 'tip_received',
      payload: { amount: '100' },
      readAt: null,
      createdAt: createdAt.toISOString(),
    });
    expect(res.body.pagination).toEqual({ limit: 20, offset: 0, total: 1, hasMore: false });
  });

  it('honours custom limit and offset query params', async () => {
    mockFindMany.mockResolvedValue([]);

    const app = createApp();
    await request(app)
      .get('/api/v1/notifications?limit=5&offset=10')
      .set('Authorization', authHeader());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', deletedAt: null }, skip: 10, take: 5 }),
    );
  });

  it('filters by unreadOnly query param', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const app = createApp();
    await request(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', authHeader());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ readAt: null }),
      }),
    );
  });

  it('returns 400 for limit above the maximum', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/v1/notifications?limit=999')
      .set('Authorization', authHeader());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a negative offset', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/v1/notifications?offset=-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── GET /api/v1/notifications/:id ────────────────────────────────────────

describe('GET /api/v1/notifications/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/notifications/notif-1');

    expect(res.status).toBe(401);
  });

  it('returns 200 with the notification for the authenticated user', async () => {
    const createdAt = new Date('2026-07-24T12:00:00.000Z');
    mockFindFirst.mockResolvedValue({
      id: 'notif-1',
      type: 'tip_received',
      payload: { amount: '500' },
      readAt: null,
      createdAt,
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/notifications/notif-1')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: 'notif-1',
      type: 'tip_received',
      payload: { amount: '500' },
      readAt: null,
      createdAt: createdAt.toISOString(),
    });
  });

  it('returns 404 for unknown notification', async () => {
    mockFindFirst.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/notifications/unknown')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ── PATCH /api/v1/notifications/:id/read ─────────────────────────────────

describe('PATCH /api/v1/notifications/:id/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without auth token', async () => {
    const app = createApp();
    const res = await request(app).patch('/api/v1/notifications/notif-1/read');

    expect(res.status).toBe(401);
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
    const res = await request(app)
      .patch('/api/v1/notifications/notif-1/read')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.readAt).toBe(readAt.toISOString());
  });

  it('returns 404 when the notification does not exist', async () => {
    mockFindFirst.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/notifications/unknown/read')
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
  });
});

// ── POST /api/v1/notifications/read-all ───────────────────────────────────

describe('POST /api/v1/notifications/read-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks all as read', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);
  });

  it('returns 0 when nothing to mark', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/notifications/read-all');

    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/notifications/unread-count ────────────────────────────────

describe('GET /api/v1/notifications/unread-count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the unread count for the authenticated user', async () => {
    mockCount.mockResolvedValue(2);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
  });

  it('returns 0 when there are no unread notifications', async () => {
    mockCount.mockResolvedValue(0);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/notifications/unread-count');

    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/notifications/preferences ─────────────────────────────────

describe('GET /api/v1/notifications/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns default preferences when none are stored', async () => {
    mockPrefFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({ tipReceived: true, goalReached: true }),
    );
  });

  it('returns the stored preferences when they exist', async () => {
    const updatedAt = new Date('2026-07-25T12:00:00.000Z');
    mockPrefFindUnique.mockResolvedValue({
      tipReceived: false,
      goalReached: true,
      updatedAt,
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      tipReceived: false,
      goalReached: true,
      updatedAt: updatedAt.toISOString(),
    });
  });
});

// ── PATCH /api/v1/notifications/preferences ──────────────────────────────

describe('PATCH /api/v1/notifications/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates preferences for the authenticated user', async () => {
    const updatedAt = new Date('2026-07-25T12:00:00.000Z');
    mockPrefUpsert.mockResolvedValue({ tipReceived: false, goalReached: true, updatedAt });

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Authorization', authHeader())
      .send({ tipReceived: false });

    expect(res.status).toBe(200);
    expect(res.body.data.tipReceived).toBe(false);
  });

  it('returns 400 for an empty request body', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Authorization', authHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when tipReceived is not a boolean', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Authorization', authHeader())
      .send({ tipReceived: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/notifications/preferences')
      .send({ tipReceived: false });

    expect(res.status).toBe(401);
  });
});

// ── OpenAPI registration ─────────────────────────────────────────────────

describe('OpenAPI registration - Notifications module', () => {
  it('registers GET /api/v1/notifications', () => {
    const op = openApiDocument.paths['/api/v1/notifications']?.get as
      | Record<string, unknown>
      | undefined;
    expect(op).toBeDefined();
    expect((op?.tags as string[]) ?? []).toContain('Notifications');
  });

  it('registers GET /api/v1/notifications/unread-count', () => {
    const op = openApiDocument.paths['/api/v1/notifications/unread-count']?.get as
      | Record<string, unknown>
      | undefined;
    expect(op).toBeDefined();
    expect((op?.tags as string[]) ?? []).toContain('Notifications');
  });

  it('registers GET and PATCH /api/v1/notifications/preferences', () => {
    const prefs = openApiDocument.paths['/api/v1/notifications/preferences'];
    expect(prefs).toBeDefined();
    expect(prefs?.get).toBeDefined();
    expect(prefs?.patch).toBeDefined();
    expect(((prefs?.patch as Record<string, unknown>).tags as string[]) ?? []).toContain(
      'Notifications',
    );
  });

  it('registers GET /api/v1/notifications/{id}', () => {
    const op = openApiDocument.paths['/api/v1/notifications/{id}']?.get as
      | Record<string, unknown>
      | undefined;
    expect(op).toBeDefined();
    expect((op?.tags as string[]) ?? []).toContain('Notifications');
  });

  it('registers PATCH /api/v1/notifications/{id}/read', () => {
    const op = openApiDocument.paths['/api/v1/notifications/{id}/read']?.patch as
      | Record<string, unknown>
      | undefined;
    expect(op).toBeDefined();
    expect((op?.tags as string[]) ?? []).toContain('Notifications');
  });

  it('registers POST /api/v1/notifications/read-all', () => {
    const op = openApiDocument.paths['/api/v1/notifications/read-all']?.post as
      | Record<string, unknown>
      | undefined;
    expect(op).toBeDefined();
    expect((op?.tags as string[]) ?? []).toContain('Notifications');
  });
});
