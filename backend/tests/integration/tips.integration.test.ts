import { describe, it, expect } from 'vitest';
import { prisma } from './setup.js';
import { createTestUser, createTestTip } from './helpers.js';
import { Prisma } from '@prisma/client';

/**
 * Integration tests for tip recording against a real database.
 * These tests verify:
 * - Tip creation with unique txHash constraint
 * - User relations (sender/receiver)
 * - Concurrent tip creation handling (P2002)
 * - Status transitions
 * - Database state consistency
 */

describe('Tips Integration Tests', () => {
  describe('Tip Creation', () => {
    it('creates a tip with all required fields', async () => {
      const sender = await createTestUser();
      const receiver = await createTestUser();

      const tip = await createTestTip({
        fromAddress: sender.stellarAddress,
        toAddress: receiver.stellarAddress,
        amountStroops: BigInt(5_000_000),
        status: 'CONFIRMED',
      });

      expect(tip).toBeDefined();
      expect(tip.fromAddress).toBe(sender.stellarAddress);
      expect(tip.toAddress).toBe(receiver.stellarAddress);
      expect(tip.amountStroops).toBe(BigInt(5_000_000));
      expect(tip.status).toBe('CONFIRMED');

      // Verify persisted in database
      const persisted = await prisma.tip.findUnique({
        where: { id: tip.id },
      });

      expect(persisted).toBeDefined();
      expect(persisted?.txHash).toBe(tip.txHash);
    });

    it('enforces unique constraint on txHash', async () => {
      const txHash = 'unique_tx_hash_12345678901234567890123456789012345678901234567890123456';

      // Create first tip
      await createTestTip({ txHash });

      // Attempt to create duplicate should fail with P2002
      await expect(
        createTestTip({ txHash }),
      ).rejects.toThrow();

      // Verify only one tip exists
      const tips = await prisma.tip.findMany({
        where: { txHash },
      });

      expect(tips).toHaveLength(1);
    });

    it('handles concurrent tip creation with same txHash', async () => {
      const txHash = 'concurrent_tx_hash_1234567890123456789012345678901234567890123456';

      // Simulate concurrent attempts to create same tip
      const results = await Promise.allSettled([
        createTestTip({ txHash, amountStroops: BigInt(1_000_000) }),
        createTestTip({ txHash, amountStroops: BigInt(1_000_000) }),
      ]);

      // One should succeed, one should fail with unique constraint
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Verify the rejection is due to unique constraint (P2002)
      const error = rejected[0].reason;
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');

      // Verify only one tip was created
      const tips = await prisma.tip.findMany({
        where: { txHash },
      });

      expect(tips).toHaveLength(1);
    });

    it('creates tip without user relations for non-registered addresses', async () => {
      const tip = await createTestTip({
        fromAddress: 'GNOTREGISTERED1234567890123456789012345678901234567890',
        toAddress: 'GNOTREGISTERED9876543210987654321098765432109876543210',
      });

      // Verify tip exists
      expect(tip).toBeDefined();

      // Verify no user relations
      const tipWithRelations = await prisma.tip.findUnique({
        where: { id: tip.id },
        include: { sender: true, receiver: true },
      });

      expect(tipWithRelations?.sender).toBeNull();
      expect(tipWithRelations?.receiver).toBeNull();
    });

    it('establishes user relations when addresses are registered', async () => {
      const sender = await createTestUser();
      const receiver = await createTestUser();

      const tip = await createTestTip({
        fromAddress: sender.stellarAddress,
        toAddress: receiver.stellarAddress,
      });

      // Verify user relations are established
      const tipWithRelations = await prisma.tip.findUnique({
        where: { id: tip.id },
        include: { sender: true, receiver: true },
      });

      expect(tipWithRelations?.sender).toBeDefined();
      expect(tipWithRelations?.sender?.id).toBe(sender.id);
      expect(tipWithRelations?.receiver).toBeDefined();
      expect(tipWithRelations?.receiver?.id).toBe(receiver.id);
    });

    it('allows self-tips (same sender and receiver)', async () => {
      const user = await createTestUser();

      const tip = await createTestTip({
        fromAddress: user.stellarAddress,
        toAddress: user.stellarAddress,
      });

      expect(tip).toBeDefined();
      expect(tip.fromAddress).toBe(tip.toAddress);

      // Verify both relations point to same user
      const tipWithRelations = await prisma.tip.findUnique({
        where: { id: tip.id },
        include: { sender: true, receiver: true },
      });

      expect(tipWithRelations?.sender?.id).toBe(user.id);
      expect(tipWithRelations?.receiver?.id).toBe(user.id);
    });
  });

  describe('Tip Status Transitions', () => {
    it('creates tip with PENDING status by default', async () => {
      const tip = await prisma.tip.create({
        data: {
          txHash: 'pending_tx_1234567890123456789012345678901234567890123456789012',
          ledger: 123456,
          fromAddress: 'GSENDER56789012345678901234567890123456789012345678901234',
          toAddress: 'GRECVR678901234567890123456789012345678901234567890123456',
          amountStroops: BigInt(1_000_000),
        },
      });

      expect(tip.status).toBe('PENDING');
    });

    it('transitions tip from PENDING to CONFIRMED', async () => {
      const tip = await createTestTip({ status: 'PENDING' });

      const updated = await prisma.tip.update({
        where: { id: tip.id },
        data: { status: 'CONFIRMED' },
      });

      expect(updated.status).toBe('CONFIRMED');

      // Verify persistence
      const persisted = await prisma.tip.findUnique({
        where: { id: tip.id },
      });

      expect(persisted?.status).toBe('CONFIRMED');
    });

    it('transitions tip from PENDING to FAILED', async () => {
      const tip = await createTestTip({ status: 'PENDING' });

      const updated = await prisma.tip.update({
        where: { id: tip.id },
        data: { status: 'FAILED' },
      });

      expect(updated.status).toBe('FAILED');
    });

    it('transitions tip from CONFIRMED to REFUNDED', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });

      const updated = await prisma.tip.update({
        where: { id: tip.id },
        data: { status: 'REFUNDED' },
      });

      expect(updated.status).toBe('REFUNDED');
    });
  });

  describe('Tip Queries and Relations', () => {
    it('queries tips by sender address', async () => {
      const sender = await createTestUser();
      const receiver1 = await createTestUser();
      const receiver2 = await createTestUser();

      // Create tips from same sender
      await createTestTip({
        fromAddress: sender.stellarAddress,
        toAddress: receiver1.stellarAddress,
      });
      await createTestTip({
        fromAddress: sender.stellarAddress,
        toAddress: receiver2.stellarAddress,
      });

      // Create tip from different sender
      await createTestTip({
        fromAddress: receiver1.stellarAddress,
        toAddress: receiver2.stellarAddress,
      });

      // Query tips by sender
      const senderTips = await prisma.tip.findMany({
        where: { fromAddress: sender.stellarAddress },
      });

      expect(senderTips).toHaveLength(2);
      expect(senderTips.every(t => t.fromAddress === sender.stellarAddress)).toBe(true);
    });

    it('queries tips by receiver address', async () => {
      const sender1 = await createTestUser();
      const sender2 = await createTestUser();
      const receiver = await createTestUser();

      // Create tips to same receiver
      await createTestTip({
        fromAddress: sender1.stellarAddress,
        toAddress: receiver.stellarAddress,
      });
      await createTestTip({
        fromAddress: sender2.stellarAddress,
        toAddress: receiver.stellarAddress,
      });

      // Create tip to different receiver
      await createTestTip({
        fromAddress: sender1.stellarAddress,
        toAddress: sender2.stellarAddress,
      });

      // Query tips by receiver
      const receiverTips = await prisma.tip.findMany({
        where: { toAddress: receiver.stellarAddress },
      });

      expect(receiverTips).toHaveLength(2);
      expect(receiverTips.every(t => t.toAddress === receiver.stellarAddress)).toBe(true);
    });

    it('queries tips by status', async () => {
      await createTestTip({ status: 'CONFIRMED' });
      await createTestTip({ status: 'CONFIRMED' });
      await createTestTip({ status: 'PENDING' });
      await createTestTip({ status: 'FAILED' });

      const confirmedTips = await prisma.tip.findMany({
        where: { status: 'CONFIRMED' },
      });

      expect(confirmedTips).toHaveLength(2);
      expect(confirmedTips.every(t => t.status === 'CONFIRMED')).toBe(true);
    });

    it('queries tips with user relations included', async () => {
      const sender = await createTestUser({ displayName: 'Sender User' });
      const receiver = await createTestUser({ displayName: 'Receiver User' });

      const tip = await createTestTip({
        fromAddress: sender.stellarAddress,
        toAddress: receiver.stellarAddress,
      });

      const tipWithUsers = await prisma.tip.findUnique({
        where: { id: tip.id },
        include: {
          sender: { select: { id: true, displayName: true } },
          receiver: { select: { id: true, displayName: true } },
        },
      });

      expect(tipWithUsers?.sender?.displayName).toBe('Sender User');
      expect(tipWithUsers?.receiver?.displayName).toBe('Receiver User');
    });

    it('orders tips by creation date descending', async () => {
      // Create tips with slight delays to ensure different timestamps
      const tip1 = await createTestTip();
      await new Promise(resolve => setTimeout(resolve, 10));
      const tip2 = await createTestTip();
      await new Promise(resolve => setTimeout(resolve, 10));
      const tip3 = await createTestTip();

      const tips = await prisma.tip.findMany({
        orderBy: { createdAt: 'desc' },
      });

      // Most recent first
      expect(tips[0].id).toBe(tip3.id);
      expect(tips[1].id).toBe(tip2.id);
      expect(tips[2].id).toBe(tip1.id);
    });
  });

  describe('Tip and Refund Relationship', () => {
    it('establishes one-to-one relationship with refund', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });

      // Create refund for tip
      const refund = await prisma.refund.create({
        data: {
          tipId: tip.id,
          amount: tip.amountStroops,
          reason: 'Test refund',
          status: 'pending',
        },
      });

      // Verify relationship
      const tipWithRefund = await prisma.tip.findUnique({
        where: { id: tip.id },
        include: { refund: true },
      });

      expect(tipWithRefund?.refund).toBeDefined();
      expect(tipWithRefund?.refund?.id).toBe(refund.id);
    });

    it('enforces one refund per tip constraint', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });

      // Create first refund
      await prisma.refund.create({
        data: {
          tipId: tip.id,
          amount: tip.amountStroops,
          reason: 'First refund',
          status: 'pending',
        },
      });

      // Attempt to create second refund should fail
      await expect(
        prisma.refund.create({
          data: {
            tipId: tip.id,
            amount: tip.amountStroops,
            reason: 'Second refund',
            status: 'pending',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Tip Indexing', () => {
    it('uses index on toAddress and createdAt for receiver queries', async () => {
      const receiver = await createTestUser();

      // Create multiple tips to receiver
      for (let i = 0; i < 10; i++) {
        await createTestTip({ toAddress: receiver.stellarAddress });
      }

      // This query should use the composite index
      const tips = await prisma.tip.findMany({
        where: { toAddress: receiver.stellarAddress },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      expect(tips).toHaveLength(5);
    });

    it('uses index on fromAddress and createdAt for sender queries', async () => {
      const sender = await createTestUser();

      // Create multiple tips from sender
      for (let i = 0; i < 10; i++) {
        await createTestTip({ fromAddress: sender.stellarAddress });
      }

      // This query should use the composite index
      const tips = await prisma.tip.findMany({
        where: { fromAddress: sender.stellarAddress },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      expect(tips).toHaveLength(5);
    });
  });
});
