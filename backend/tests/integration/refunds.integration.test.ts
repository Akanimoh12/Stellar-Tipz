import { describe, it, expect } from 'vitest';
import { prisma } from './setup.js';
import { createTestUser, createTestTip, createTestRefund } from './helpers.js';
import { Prisma } from '@prisma/client';

/**
 * Integration tests for refund flow against a real database.
 * These tests verify:
 * - Refund creation with unique tipId constraint
 * - Concurrent refund request handling (P2002) - validates fix from #1249
 * - Refund-tip relationship
 * - Status transitions
 * - Database state consistency
 */

describe('Refunds Integration Tests', () => {
  describe('Refund Creation', () => {
    it('creates a refund for a confirmed tip', async () => {
      const sender = await createTestUser();
      const receiver = await createTestUser();

      const tip = await createTestTip({
        fromAddress: sender.stellarAddress,
        toAddress: receiver.stellarAddress,
        status: 'CONFIRMED',
        amountStroops: BigInt(5_000_000),
      });

      const refund = await createTestRefund({
        tipId: tip.id,
        amount: tip.amountStroops,
        reason: 'Wrong recipient',
      });

      expect(refund).toBeDefined();
      expect(refund.tipId).toBe(tip.id);
      expect(refund.amount).toBe(tip.amountStroops);
      expect(refund.status).toBe('pending');

      // Verify persisted in database
      const persisted = await prisma.refund.findUnique({
        where: { id: refund.id },
      });

      expect(persisted).toBeDefined();
      expect(persisted?.tipId).toBe(tip.id);
    });

    it('enforces unique constraint on tipId', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });

      // Create first refund
      await createTestRefund({
        tipId: tip.id,
        reason: 'First refund',
      });

      // Attempt to create duplicate refund should fail with P2002
      await expect(
        createTestRefund({
          tipId: tip.id,
          reason: 'Second refund attempt',
        }),
      ).rejects.toThrow();

      // Verify only one refund exists
      const refunds = await prisma.refund.findMany({
        where: { tipId: tip.id },
      });

      expect(refunds).toHaveLength(1);
    });

    it('handles concurrent refund creation with same tipId (validates #1249 fix)', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });

      // Simulate concurrent attempts to create refund for same tip
      // This tests the fix from issue #1249 - race condition handling
      const results = await Promise.allSettled([
        prisma.refund.create({
          data: {
            tipId: tip.id,
            amount: tip.amountStroops,
            reason: 'Concurrent request 1',
            status: 'pending',
          },
        }),
        prisma.refund.create({
          data: {
            tipId: tip.id,
            amount: tip.amountStroops,
            reason: 'Concurrent request 2',
            status: 'pending',
          },
        }),
      ]);

      // One should succeed, one should fail with unique constraint (P2002)
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Verify the rejection is due to unique constraint violation
      const error = rejected[0].reason;
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');

      // Verify only one refund was created
      const refunds = await prisma.refund.findMany({
        where: { tipId: tip.id },
      });

      expect(refunds).toHaveLength(1);
    });

    it('allows refunds for different tips', async () => {
      const tip1 = await createTestTip({ status: 'CONFIRMED' });
      const tip2 = await createTestTip({ status: 'CONFIRMED' });

      const refund1 = await createTestRefund({
        tipId: tip1.id,
        reason: 'Refund for tip 1',
      });

      const refund2 = await createTestRefund({
        tipId: tip2.id,
        reason: 'Refund for tip 2',
      });

      expect(refund1.tipId).toBe(tip1.id);
      expect(refund2.tipId).toBe(tip2.id);

      // Verify both refunds exist
      const allRefunds = await prisma.refund.findMany({
        where: {
          id: { in: [refund1.id, refund2.id] },
        },
      });

      expect(allRefunds).toHaveLength(2);
    });
  });

  describe('Refund-Tip Relationship', () => {
    it('establishes one-to-one relationship with tip', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });
      const refund = await createTestRefund({ tipId: tip.id });

      // Verify relationship from refund side
      const refundWithTip = await prisma.refund.findUnique({
        where: { id: refund.id },
        include: { tip: true },
      });

      expect(refundWithTip?.tip).toBeDefined();
      expect(refundWithTip?.tip.id).toBe(tip.id);

      // Verify relationship from tip side
      const tipWithRefund = await prisma.tip.findUnique({
        where: { id: tip.id },
        include: { refund: true },
      });

      expect(tipWithRefund?.refund).toBeDefined();
      expect(tipWithRefund?.refund?.id).toBe(refund.id);
    });

    it('cascades delete when tip is deleted', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });
      const refund = await createTestRefund({ tipId: tip.id });

      // Delete tip
      await prisma.tip.delete({ where: { id: tip.id } });

      // Refund should be deleted due to cascade
      const refundAfterDelete = await prisma.refund.findUnique({
        where: { id: refund.id },
      });

      expect(refundAfterDelete).toBeNull();
    });

    it('includes tip details when querying refund', async () => {
      const sender = await createTestUser({ displayName: 'Sender' });
      const receiver = await createTestUser({ displayName: 'Receiver' });

      const tip = await createTestTip({
        fromAddress: sender.stellarAddress,
        toAddress: receiver.stellarAddress,
        amountStroops: BigInt(3_000_000),
        status: 'CONFIRMED',
      });

      const refund = await createTestRefund({
        tipId: tip.id,
        amount: tip.amountStroops,
      });

      // Query refund with tip details
      const refundWithTip = await prisma.refund.findUnique({
        where: { id: refund.id },
        include: {
          tip: {
            include: {
              sender: { select: { displayName: true } },
              receiver: { select: { displayName: true } },
            },
          },
        },
      });

      expect(refundWithTip?.tip.sender?.displayName).toBe('Sender');
      expect(refundWithTip?.tip.receiver?.displayName).toBe('Receiver');
      expect(refundWithTip?.tip.amountStroops).toBe(BigInt(3_000_000));
    });
  });

  describe('Refund Status Transitions', () => {
    it('creates refund with pending status by default', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });

      const refund = await prisma.refund.create({
        data: {
          tipId: tip.id,
          amount: tip.amountStroops,
          reason: 'Test refund',
        },
      });

      expect(refund.status).toBe('pending');
    });

    it('transitions refund from pending to completed', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });
      const refund = await createTestRefund({ tipId: tip.id, status: 'pending' });

      const updated = await prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: 'completed',
          txHash: 'refund_tx_hash_1234567890123456789012345678901234567890123456',
        },
      });

      expect(updated.status).toBe('completed');
      expect(updated.txHash).toBeDefined();

      // Verify persistence
      const persisted = await prisma.refund.findUnique({
        where: { id: refund.id },
      });

      expect(persisted?.status).toBe('completed');
      expect(persisted?.txHash).toBe(updated.txHash);
    });

    it('transitions refund from pending to failed', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });
      const refund = await createTestRefund({ tipId: tip.id });

      const updated = await prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'failed' },
      });

      expect(updated.status).toBe('failed');
    });

    it('updates tip status to REFUNDED when refund completes', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });
      const refund = await createTestRefund({ tipId: tip.id });

      // Complete refund and update tip
      await prisma.$transaction([
        prisma.refund.update({
          where: { id: refund.id },
          data: { status: 'completed', txHash: 'refund_tx_abc123' },
        }),
        prisma.tip.update({
          where: { id: tip.id },
          data: { status: 'REFUNDED' },
        }),
      ]);

      // Verify both updates
      const updatedTip = await prisma.tip.findUnique({
        where: { id: tip.id },
      });
      const updatedRefund = await prisma.refund.findUnique({
        where: { id: refund.id },
      });

      expect(updatedTip?.status).toBe('REFUNDED');
      expect(updatedRefund?.status).toBe('completed');
    });
  });

  describe('Refund Queries', () => {
    it('queries refunds by status', async () => {
      const tip1 = await createTestTip({ status: 'CONFIRMED' });
      const tip2 = await createTestTip({ status: 'CONFIRMED' });
      const tip3 = await createTestTip({ status: 'CONFIRMED' });

      await createTestRefund({ tipId: tip1.id, status: 'pending' });
      await createTestRefund({ tipId: tip2.id, status: 'completed' });
      await createTestRefund({ tipId: tip3.id, status: 'pending' });

      const pendingRefunds = await prisma.refund.findMany({
        where: { status: 'pending' },
      });

      expect(pendingRefunds).toHaveLength(2);
      expect(pendingRefunds.every(r => r.status === 'pending')).toBe(true);
    });

    it('queries refunds by sender address through tip relation', async () => {
      const sender = await createTestUser();
      const receiver1 = await createTestUser();
      const receiver2 = await createTestUser();

      const tip1 = await createTestTip({
        fromAddress: sender.stellarAddress,
        toAddress: receiver1.stellarAddress,
        status: 'CONFIRMED',
      });

      const tip2 = await createTestTip({
        fromAddress: sender.stellarAddress,
        toAddress: receiver2.stellarAddress,
        status: 'CONFIRMED',
      });

      // Create refunds for sender's tips
      await createTestRefund({ tipId: tip1.id });
      await createTestRefund({ tipId: tip2.id });

      // Create refund for different sender
      const otherTip = await createTestTip({
        fromAddress: receiver1.stellarAddress,
        toAddress: sender.stellarAddress,
        status: 'CONFIRMED',
      });
      await createTestRefund({ tipId: otherTip.id });

      // Query refunds for sender
      const senderRefunds = await prisma.refund.findMany({
        where: {
          tip: { fromAddress: sender.stellarAddress },
        },
      });

      expect(senderRefunds).toHaveLength(2);
    });

    it('orders refunds by creation date descending', async () => {
      const tip1 = await createTestTip({ status: 'CONFIRMED' });
      const tip2 = await createTestTip({ status: 'CONFIRMED' });
      const tip3 = await createTestTip({ status: 'CONFIRMED' });

      const refund1 = await createTestRefund({ tipId: tip1.id });
      await new Promise(resolve => setTimeout(resolve, 10));
      const refund2 = await createTestRefund({ tipId: tip2.id });
      await new Promise(resolve => setTimeout(resolve, 10));
      const refund3 = await createTestRefund({ tipId: tip3.id });

      const refunds = await prisma.refund.findMany({
        orderBy: { createdAt: 'desc' },
      });

      // Most recent first
      expect(refunds[0].id).toBe(refund3.id);
      expect(refunds[1].id).toBe(refund2.id);
      expect(refunds[2].id).toBe(refund1.id);
    });

    it('paginates refunds with limit and offset', async () => {
      // Create multiple refunds
      const tips = await Promise.all(
        Array.from({ length: 5 }, () => createTestTip({ status: 'CONFIRMED' })),
      );

      for (const tip of tips) {
        await createTestRefund({ tipId: tip.id });
      }

      // Query with pagination
      const page1 = await prisma.refund.findMany({
        take: 2,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });

      const page2 = await prisma.refund.findMany({
        take: 2,
        skip: 2,
        orderBy: { createdAt: 'desc' },
      });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);

      // Ensure no overlap
      const page1Ids = page1.map(r => r.id);
      const page2Ids = page2.map(r => r.id);
      const overlap = page1Ids.filter(id => page2Ids.includes(id));

      expect(overlap).toHaveLength(0);
    });
  });

  describe('Refund Amount Validation', () => {
    it('allows refund amount equal to tip amount', async () => {
      const tip = await createTestTip({
        status: 'CONFIRMED',
        amountStroops: BigInt(5_000_000),
      });

      const refund = await createTestRefund({
        tipId: tip.id,
        amount: BigInt(5_000_000),
      });

      expect(refund.amount).toBe(tip.amountStroops);
    });

    it('allows partial refund amount less than tip amount', async () => {
      const tip = await createTestTip({
        status: 'CONFIRMED',
        amountStroops: BigInt(5_000_000),
      });

      const refund = await createTestRefund({
        tipId: tip.id,
        amount: BigInt(3_000_000), // Partial refund
      });

      expect(refund.amount).toBe(BigInt(3_000_000));
      expect(refund.amount).toBeLessThan(tip.amountStroops);
    });

    it('stores refund reason', async () => {
      const tip = await createTestTip({ status: 'CONFIRMED' });

      const refund = await createTestRefund({
        tipId: tip.id,
        reason: 'Sent to wrong address by mistake',
      });

      expect(refund.reason).toBe('Sent to wrong address by mistake');

      // Verify persistence
      const persisted = await prisma.refund.findUnique({
        where: { id: refund.id },
      });

      expect(persisted?.reason).toBe('Sent to wrong address by mistake');
    });
  });
});
