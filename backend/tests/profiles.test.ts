import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    tip: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

function makeToken(payload: { userId: string; stellarAddress: string; role?: string; scopes?: string[] }): string {
  return jwt.sign(payload, env.JWT_SECRET);
}

describe('Profiles Flow', () => {
  const app = createApp();
  const userId = 'user_abc';
  const stellarAddress = 'GBRPYH6YCQ3Y7B7V76YZV6A6IS2T6AM27QJ2632CS67ME65OF55JBNX7';
  const token = makeToken({ userId, stellarAddress });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PUT /api/v1/profiles/me', () => {
    it('updates own profile when authenticated', async () => {
      const activeUser = {
        id: userId,
        stellarAddress,
        username: 'john_doe',
        displayName: 'John',
        bio: 'Hello',
        imageUrl: 'http://img.com',
        avatarCid: 'cid',
        xHandle: 'john_x',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeUser as any);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(activeUser as any);
      vi.mocked(prisma.tip.count).mockResolvedValue(5);
      vi.mocked(prisma.tip.aggregate).mockResolvedValue({ _sum: { amountStroops: BigInt(5000000) } } as any);

      const res = await request(app)
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'John New', bio: 'Updated bio' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', userId);
      expect(res.body).toHaveProperty('tipsCount', 5);
      expect(res.body).toHaveProperty('totalReceived', '5000000');
    });

    it('returns 404 if profile is soft-deleted', async () => {
      const deletedUser = {
        id: userId,
        stellarAddress,
        deletedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(deletedUser as any);

      const res = await request(app)
        .put('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'New Name' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/profiles/me', () => {
    it('deactivates (soft-deletes) own profile', async () => {
      const activeUser = {
        id: userId,
        stellarAddress,
        deletedAt: null,
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeUser as any);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({ ...activeUser, deletedAt: new Date() } as any);

      const res = await request(app)
        .delete('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Profile deactivated successfully' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('GET /api/v1/profiles/:id', () => {
    it('returns public profile with tip stats', async () => {
      const targetUser = {
        id: 'user_target',
        stellarAddress: 'G_TARGET',
        username: 'target',
        displayName: 'Target User',
        bio: 'Some bio',
        imageUrl: null,
        avatarCid: null,
        xHandle: null,
        deletedAt: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(targetUser as any);
      vi.mocked(prisma.tip.count).mockResolvedValueOnce(10);
      vi.mocked(prisma.tip.aggregate).mockResolvedValueOnce({ _sum: { amountStroops: BigInt(1234567890) } } as any);

      const res = await request(app).get('/api/v1/profiles/user_target');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 'user_target');
      expect(res.body).toHaveProperty('tipsCount', 10);
      expect(res.body).toHaveProperty('totalReceived', '1234567890');
    });

    it('returns 404 for a soft-deleted profile', async () => {
      const deletedUser = {
        id: 'user_deleted',
        deletedAt: new Date(),
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(deletedUser as any);

      const res = await request(app).get('/api/v1/profiles/user_deleted');

      expect(res.status).toBe(404);
    });
  });
});
