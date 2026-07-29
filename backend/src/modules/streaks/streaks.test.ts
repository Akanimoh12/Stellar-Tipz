import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';

const { mockUserFindUnique, mockStreakFindUnique } = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockStreakFindUnique: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    streak: { findUnique: mockStreakFindUnique },
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
});
