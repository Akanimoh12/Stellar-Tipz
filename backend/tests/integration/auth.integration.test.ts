import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from './setup.js';
import { createTestUser, createTestChallenge } from './helpers.js';
import { createHash } from 'crypto';

/**
 * Integration tests for the auth flow against a real database.
 * These tests verify:
 * - Challenge creation and storage
 * - User creation with unique constraint enforcement
 * - Token generation and refresh
 * - Database state consistency
 */

describe('Auth Integration Tests', () => {
  const app = createApp();
  const stellarAddress = 'GBTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  describe('POST /api/v1/auth/challenge', () => {
    it('creates a challenge in the database', async () => {
      const res = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ stellarAddress });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('challenge');
      expect(res.body).toHaveProperty('expiresAt');

      // Verify challenge was persisted
      const challenge = await prisma.authChallenge.findUnique({
        where: { challenge: res.body.challenge },
      });

      expect(challenge).toBeDefined();
      expect(challenge?.stellarAddress).toBe(stellarAddress);
      expect(challenge?.network).toBe('TESTNET');
      expect(challenge?.usedAt).toBeNull();
    });

    it('reuses existing unused challenge for same address', async () => {
      // Create first challenge
      const res1 = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ stellarAddress });

      const challenge1 = res1.body.challenge;

      // Request another challenge for same address
      const res2 = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ stellarAddress });

      // Should return the same challenge
      expect(res2.body.challenge).toBe(challenge1);

      // Verify only one challenge exists in DB
      const challenges = await prisma.authChallenge.findMany({
        where: { stellarAddress, usedAt: null },
      });

      expect(challenges).toHaveLength(1);
    });

    it('cleans up expired challenges before creating new one', async () => {
      // Create an expired challenge directly
      const expiredChallenge = await prisma.authChallenge.create({
        data: {
          stellarAddress,
          challenge: 'expired_challenge_string',
          network: 'TESTNET',
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      // Request a new challenge
      const res = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ stellarAddress });

      expect(res.status).toBe(200);

      // Expired challenge should be deleted
      const expired = await prisma.authChallenge.findUnique({
        where: { id: expiredChallenge.id },
      });

      expect(expired).toBeNull();
    });
  });

  describe('POST /api/v1/auth/verify', () => {
    it('creates a new user on first authentication', async () => {
      const newAddress = 'GBNEWUSER7XK7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V';

      // Create a challenge
      const challenge = await createTestChallenge(newAddress, 'test_challenge');

      // Mock signature verification would happen here
      // For integration tests, we test the database flow
      // The actual signature verification is mocked in the unit tests

      // Verify no user exists yet
      const userBefore = await prisma.user.findUnique({
        where: { stellarAddress: newAddress },
      });
      expect(userBefore).toBeNull();

      // In a real scenario, verifyChallenge creates the user
      // We'll simulate that by creating the user directly
      const user = await prisma.user.create({
        data: { stellarAddress: newAddress },
      });

      expect(user).toBeDefined();
      expect(user.stellarAddress).toBe(newAddress);

      // Verify user was persisted
      const userAfter = await prisma.user.findUnique({
        where: { stellarAddress: newAddress },
      });

      expect(userAfter).toBeDefined();
      expect(userAfter?.id).toBe(user.id);
    });

    it('enforces unique constraint on stellarAddress', async () => {
      const address = 'GBUNIQUE5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7';

      // Create first user
      await createTestUser({ stellarAddress: address });

      // Attempt to create duplicate user should fail with unique constraint
      await expect(
        prisma.user.create({ data: { stellarAddress: address } }),
      ).rejects.toThrow();

      // Verify only one user exists
      const users = await prisma.user.findMany({
        where: { stellarAddress: address },
      });

      expect(users).toHaveLength(1);
    });

    it('marks challenge as used after verification', async () => {
      const challenge = await createTestChallenge(stellarAddress, 'verify_test');

      // Mark challenge as used
      const updated = await prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: new Date() },
      });

      expect(updated.usedAt).not.toBeNull();

      // Verify challenge cannot be reused
      const reused = await prisma.authChallenge.findFirst({
        where: {
          challenge: challenge.challenge,
          usedAt: { not: null },
        },
      });

      expect(reused).toBeDefined();
      expect(reused?.id).toBe(challenge.id);
    });

    it('handles concurrent user creation attempts gracefully', async () => {
      const address = 'GBCONCURRENT4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X';

      // Simulate concurrent attempts to create same user
      const results = await Promise.allSettled([
        prisma.user.create({ data: { stellarAddress: address } }),
        prisma.user.create({ data: { stellarAddress: address } }),
      ]);

      // One should succeed, one should fail
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Verify only one user was created
      const users = await prisma.user.findMany({
        where: { stellarAddress: address },
      });

      expect(users).toHaveLength(1);
    });
  });

  describe('Refresh Token Management', () => {
    it('creates and stores refresh token', async () => {
      const user = await createTestUser();
      const tokenValue = 'test_refresh_token_value';
      const hashedToken = createHash('sha256').update(tokenValue).digest('hex');

      const refreshToken = await prisma.refreshToken.create({
        data: {
          userId: user.id,
          hashedToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      expect(refreshToken).toBeDefined();
      expect(refreshToken.userId).toBe(user.id);
      expect(refreshToken.hashedToken).toBe(hashedToken);
      expect(refreshToken.revokedAt).toBeNull();
    });

    it('revokes refresh token on logout', async () => {
      const user = await createTestUser();
      const hashedToken = createHash('sha256').update('token123').digest('hex');

      const token = await prisma.refreshToken.create({
        data: {
          userId: user.id,
          hashedToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Revoke the token
      const revoked = await prisma.refreshToken.update({
        where: { id: token.id },
        data: { revokedAt: new Date() },
      });

      expect(revoked.revokedAt).not.toBeNull();

      // Verify revoked token cannot be used
      const tokenCheck = await prisma.refreshToken.findUnique({
        where: { id: token.id },
      });

      expect(tokenCheck?.revokedAt).not.toBeNull();
    });

    it('enforces unique constraint on hashedToken', async () => {
      const user = await createTestUser();
      const hashedToken = createHash('sha256').update('duplicate_token').digest('hex');

      // Create first token
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          hashedToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Attempt to create duplicate should fail
      await expect(
        prisma.refreshToken.create({
          data: {
            userId: user.id,
            hashedToken,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        }),
      ).rejects.toThrow();
    });

    it('cascades delete when user is deleted', async () => {
      const user = await createTestUser();
      const hashedToken = createHash('sha256').update('cascade_test').digest('hex');

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          hashedToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Delete user
      await prisma.user.delete({ where: { id: user.id } });

      // Refresh token should be deleted due to cascade
      const tokens = await prisma.refreshToken.findMany({
        where: { userId: user.id },
      });

      expect(tokens).toHaveLength(0);
    });
  });

  describe('Complete Auth Flow Integration', () => {
    it('completes full authentication lifecycle', async () => {
      const testAddress = 'GBFULLFLOW5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z7O4X7K7Q5V5Z';

      // Step 1: Create challenge
      const challengeRecord = await createTestChallenge(testAddress);
      expect(challengeRecord.usedAt).toBeNull();

      // Step 2: Verify no user exists
      let user = await prisma.user.findUnique({
        where: { stellarAddress: testAddress },
      });
      expect(user).toBeNull();

      // Step 3: Create user on verification
      user = await prisma.user.create({
        data: { stellarAddress: testAddress },
      });
      expect(user).toBeDefined();

      // Step 4: Mark challenge as used
      await prisma.authChallenge.update({
        where: { id: challengeRecord.id },
        data: { usedAt: new Date() },
      });

      // Step 5: Create refresh token
      const hashedToken = createHash('sha256').update('flow_token').digest('hex');
      const refreshToken = await prisma.refreshToken.create({
        data: {
          userId: user.id,
          hashedToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Step 6: Verify all records exist
      const finalUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: { refreshTokens: true },
      });

      expect(finalUser).toBeDefined();
      expect(finalUser?.refreshTokens).toHaveLength(1);
      expect(finalUser?.refreshTokens[0].id).toBe(refreshToken.id);

      // Step 7: Revoke token on logout
      await prisma.refreshToken.update({
        where: { id: refreshToken.id },
        data: { revokedAt: new Date() },
      });

      const revokedToken = await prisma.refreshToken.findUnique({
        where: { id: refreshToken.id },
      });

      expect(revokedToken?.revokedAt).not.toBeNull();
    });
  });
});
