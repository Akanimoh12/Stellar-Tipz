import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { updateStreakOnTip } from './streaks.service.js';

const { mockUserFindUnique, mockStreakFindUnique, mockStreakCreate, mockStreakUpdate } =
  vi.hoisted(() => ({
    mockUserFindUnique: vi.fn(),
    mockStreakFindUnique: vi.fn(),
    mockStreakCreate: vi.fn(),
    mockStreakUpdate: vi.fn(),
  }));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    streak: {
      findUnique: mockStreakFindUnique,
      create: mockStreakCreate,
      update: mockStreakUpdate,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}));

const jwt = await import('jsonwebtoken');
const address = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';

function mockAuth(userId = 'user-1'): void {
  (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
    sub: userId,
    stellarAddress: address,
  });
}

function getTestDates() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);

  return { today, yesterday, twoDaysAgo };
}

describe('GET /api/v1/streaks/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without an Authorization header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/streaks/me');
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's streak", async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockStreakFindUnique.mockResolvedValue({
      id: 'streak-1',
      userId: 'user-1',
      currentStreak: 3,
      longestStreak: 7,
      lastTipDate: new Date('2024-01-01T00:00:00.000Z'),
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/streaks/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      currentStreak: 3,
      longestStreak: 7,
      lastTipDate: '2024-01-01T00:00:00.000Z',
    });
  });

  it('returns a zeroed streak when the user has never tipped', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1', stellarAddress: address });
    mockStreakFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/streaks/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastTipDate: null,
    });
  });

  it('returns 400 when user does not exist in database', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/streaks/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('User not found');
  });
});

describe('updateStreakOnTip service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new streak record on first tip ever', async () => {
    mockStreakFindUnique.mockResolvedValue(null);
    mockStreakCreate.mockResolvedValue({
      id: 'streak-new',
      userId: 'user-1',
      currentStreak: 1,
      longestStreak: 1,
      lastTipDate: new Date(),
    });

    const result = await updateStreakOnTip('user-1');

    expect(mockStreakFindUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(mockStreakCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        currentStreak: 1,
        longestStreak: 1,
        lastTipDate: expect.any(Date),
      },
    });
    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      streakUpdated: true,
    });
  });

  it('returns streakUpdated: false when user has already tipped today', async () => {
    const { today } = getTestDates();
    mockStreakFindUnique.mockResolvedValue({
      id: 'streak-1',
      userId: 'user-1',
      currentStreak: 5,
      longestStreak: 8,
      lastTipDate: today,
    });

    const result = await updateStreakOnTip('user-1');

    expect(mockStreakFindUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(mockStreakUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({
      currentStreak: 5,
      longestStreak: 8,
      streakUpdated: false,
    });
  });

  it('increments current streak and updates longest streak when user tipped yesterday (new peak)', async () => {
    const { yesterday } = getTestDates();
    mockStreakFindUnique.mockResolvedValue({
      id: 'streak-1',
      userId: 'user-1',
      currentStreak: 4,
      longestStreak: 4,
      lastTipDate: yesterday,
    });
    mockStreakUpdate.mockResolvedValue({
      id: 'streak-1',
      userId: 'user-1',
      currentStreak: 5,
      longestStreak: 5,
      lastTipDate: new Date(),
    });

    const result = await updateStreakOnTip('user-1');

    expect(mockStreakUpdate).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        currentStreak: 5,
        longestStreak: 5,
        lastTipDate: expect.any(Date),
      },
    });
    expect(result).toEqual({
      currentStreak: 5,
      longestStreak: 5,
      streakUpdated: true,
    });
  });

  it('increments current streak but retains longest streak when current <= longest', async () => {
    const { yesterday } = getTestDates();
    mockStreakFindUnique.mockResolvedValue({
      id: 'streak-1',
      userId: 'user-1',
      currentStreak: 3,
      longestStreak: 10,
      lastTipDate: yesterday,
    });
    mockStreakUpdate.mockResolvedValue({
      id: 'streak-1',
      userId: 'user-1',
      currentStreak: 4,
      longestStreak: 10,
      lastTipDate: new Date(),
    });

    const result = await updateStreakOnTip('user-1');

    expect(mockStreakUpdate).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        currentStreak: 4,
        longestStreak: 10,
        lastTipDate: expect.any(Date),
      },
    });
    expect(result).toEqual({
      currentStreak: 4,
      longestStreak: 10,
      streakUpdated: true,
    });
  });

  it('resets current streak to 1 when streak is broken (>1 day since last tip)', async () => {
    const { twoDaysAgo } = getTestDates();
    mockStreakFindUnique.mockResolvedValue({
      id: 'streak-1',
      userId: 'user-1',
      currentStreak: 7,
      longestStreak: 12,
      lastTipDate: twoDaysAgo,
    });
    mockStreakUpdate.mockResolvedValue({
      id: 'streak-1',
      userId: 'user-1',
      currentStreak: 1,
      longestStreak: 12,
      lastTipDate: new Date(),
    });

    const result = await updateStreakOnTip('user-1');

    expect(mockStreakUpdate).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        currentStreak: 1,
        longestStreak: 12,
        lastTipDate: expect.any(Date),
      },
    });
    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 12,
      streakUpdated: true,
    });
  });
});
