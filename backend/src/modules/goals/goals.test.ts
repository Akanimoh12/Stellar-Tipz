import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../../app.js';

const { mockGoalFindUnique, mockGoalFindMany, mockGoalCreate, mockGoalUpdate, mockGoalCount } =
  vi.hoisted(() => ({
    mockGoalFindUnique: vi.fn(),
    mockGoalFindMany: vi.fn(),
    mockGoalCreate: vi.fn(),
    mockGoalUpdate: vi.fn(),
    mockGoalCount: vi.fn(),
  }));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    goal: {
      findUnique: mockGoalFindUnique,
      findMany: mockGoalFindMany,
      create: mockGoalCreate,
      update: mockGoalUpdate,
      count: mockGoalCount,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(() => ({
      userId: 'user-1',
      stellarAddress: 'GABCDEF123456789012345678901234567890123456789012345678901234',
      role: 'user',
      scopes: [],
    })),
  },
  verify: vi.fn(() => ({
    userId: 'user-1',
    stellarAddress: 'GABCDEF123456789012345678901234567890123456789012345678901234',
    role: 'user',
    scopes: [],
  })),
}));

function resetMocks() {
  vi.clearAllMocks();
  mockGoalFindMany.mockResolvedValue([]);
  mockGoalCount.mockResolvedValue(0);
}

describe('GET /api/v1/goals', () => {
  beforeEach(resetMocks);

  it('returns 200 with empty list by default', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/goals');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 0,
      hasMore: false,
    });
  });

  it('returns goals with pagination', async () => {
    const now = new Date();
    mockGoalFindMany.mockResolvedValue([
      {
        id: 'goal-1',
        userId: 'user-1',
        title: 'Fund my project',
        targetStroops: BigInt(1000000000),
        raisedStroops: BigInt(500000000),
        deadline: null,
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    mockGoalCount.mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get('/api/v1/goals');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Fund my project');
    expect(res.body.data[0].targetStroops).toBe('1000000000');
    expect(res.body.data[0].raisedStroops).toBe('500000000');
    expect(res.body.pagination.total).toBe(1);
  });

  it('filters by status', async () => {
    const app = createApp();
    await request(app).get('/api/v1/goals?status=ACTIVE');

    expect(mockGoalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });
});

describe('GET /api/v1/goals/:id', () => {
  beforeEach(resetMocks);

  it('returns 200 for an existing goal', async () => {
    const now = new Date();
    mockGoalFindUnique.mockResolvedValue({
      id: 'goal-1',
      userId: 'user-1',
      title: 'Test goal',
      targetStroops: BigInt(1000000),
      raisedStroops: BigInt(500000),
      deadline: null,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const app = createApp();
    const res = await request(app).get('/api/v1/goals/goal-1');

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Test goal');
  });

  it('returns 404 for a non-existent goal', async () => {
    mockGoalFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/v1/goals/nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/goals', () => {
  beforeEach(resetMocks);

  it('returns 201 when creating a goal', async () => {
    const now = new Date();
    mockGoalCreate.mockResolvedValue({
      id: 'goal-new',
      userId: 'user-1',
      title: 'New goal',
      targetStroops: BigInt(2000000),
      raisedStroops: BigInt(0),
      deadline: null,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/goals')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'New goal', targetStroops: '2000000' });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('New goal');
    expect(res.body.data.targetStroops).toBe('2000000');
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/goals')
      .send({ title: 'New goal', targetStroops: '2000000' });

    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid data', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/goals')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: '', targetStroops: 'abc' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/goals/:id', () => {
  beforeEach(resetMocks);

  it('returns 200 when updating own goal', async () => {
    const now = new Date();
    mockGoalFindUnique.mockResolvedValue({
      id: 'goal-1',
      userId: 'user-1',
      title: 'Old title',
      targetStroops: BigInt(1000000),
      raisedStroops: BigInt(0),
      deadline: null,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    mockGoalUpdate.mockResolvedValue({
      id: 'goal-1',
      userId: 'user-1',
      title: 'Updated title',
      targetStroops: BigInt(2000000),
      raisedStroops: BigInt(0),
      deadline: null,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/goals/goal-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'Updated title', targetStroops: '2000000' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated title');
  });

  it('returns 403 when updating another user goal', async () => {
    mockGoalFindUnique.mockResolvedValue({
      id: 'goal-1',
      userId: 'user-2',
      title: 'Other user goal',
      targetStroops: BigInt(1000000),
      raisedStroops: BigInt(0),
      deadline: null,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/goals/goal-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/goals/goal-1')
      .send({ title: 'Updated' });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/goals/:id', () => {
  beforeEach(resetMocks);

  it('returns 200 when cancelling own goal', async () => {
    const now = new Date();
    mockGoalFindUnique.mockResolvedValue({
      id: 'goal-1',
      userId: 'user-1',
      title: 'My goal',
      targetStroops: BigInt(1000000),
      raisedStroops: BigInt(0),
      deadline: null,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    mockGoalUpdate.mockResolvedValue({
      id: 'goal-1',
      userId: 'user-1',
      title: 'My goal',
      targetStroops: BigInt(1000000),
      raisedStroops: BigInt(0),
      deadline: null,
      status: 'CANCELLED',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const app = createApp();
    const res = await request(app)
      .delete('/api/v1/goals/goal-1')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('returns 403 when cancelling another user goal', async () => {
    mockGoalFindUnique.mockResolvedValue({
      id: 'goal-1',
      userId: 'user-2',
      title: 'Other goal',
      targetStroops: BigInt(1000000),
      raisedStroops: BigInt(0),
      deadline: null,
      status: 'ACTIVE',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .delete('/api/v1/goals/goal-1')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const app = createApp();
    const res = await request(app).delete('/api/v1/goals/goal-1');

    expect(res.status).toBe(401);
  });
});
