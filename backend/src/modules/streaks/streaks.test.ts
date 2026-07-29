import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';

const {
  mockFindUnique,
  mockCreate,
  mockUpdate,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    streak: {
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
    $disconnect: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: vi.fn() },
}));

const jwt = await import('jsonwebtoken');
const stellarAddress = 'GF5YV3FQRHRMA7IQWCZKGRRJ5P7CEPIVBQLM4X2FEHS2IU57KF3U4CLN';

function mockAuth(userId = 'user-1'): void {
  (jwt.default.verify as ReturnType<typeof vi.fn>).mockReturnValue({
    sub: userId,
    stellarAddress,
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

  it('returns streak data when streak exists', async () => {
    mockAuth();
    mockFindUnique.mockResolvedValue({
      id: 'streak_01',
      userId: 'user-1',
      currentStreak: 5,
      longestStreak: 10,
      lastTipDate: new Date('2026-07-28T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-28T00:00:00.000Z'),
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/streaks/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      userId: 'user-1',
      currentStreak: 5,
      longestStreak: 10,
    });
  });

  it('returns empty streak when user has no streak yet', async () => {
    mockAuth();
    mockFindUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get('/api/v1/streaks/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      userId: 'user-1',
      currentStreak: 0,
      longestStreak: 0,
      lastTipDate: null,
    });
  });
});
