import { describe, it, expect } from 'vitest';
import { prisma } from './setup.js';
import { createTestUser, createTestWithdrawal, createTestTip } from './helpers.js';
import { Prisma } from '@prisma/client';

/**
 * Integration tests for withdrawal flow against a real database.
 * These tests verify:
 * - Withdrawal creation with unique txHash constraint
 * - Concurrent submission handling (P2002)
 * - User relationship and cascade deletes
 * - Status transitions
 * - Balance calculations
 * - Database state consistency
 */

describe('Withdrawals Integration Tests', () => {
  describe('Withdrawal Creation', () => {
    it('creates a withdrawal for a user', async () => {
      const user = await createTestUser();

      const withdrawal = await createTestWithdrawal({
        userId: user.id,
        amount: BigInt(10_000_000),
        fee: BigInt(100_000),
      });

      expect(withdrawal).toBeDefined();
      expect(withdrawal.userId).toBe(user.id);
      expect(withdrawal.amount).toBe(BigInt(10_000_000));
      expect(withdrawal.fee).toBe(BigInt(100_000));
      expect(withdrawal.status).toBe('PENDING');

      // Verify persisted in database
      const persisted = await prisma.withdrawal.findUnique({
        where: { id: withdrawal.id },
      });

      expect(persisted).toBeDefined();
      expect(persisted?.userId).toBe(user.id);
    });

    it('creates withdrawal without txHash initially', async () => {
      const user = await createTestUser();

      const withdrawal = await createTestWithdrawal({
        userId: user.id,
      });

      expect(withdrawal.txHash).toBeNull();
      expect(withdrawal.status).toBe('PENDING');
    });

    it('enforces unique constraint on txHash when set', async () => {
      const user = await createTestUser();
      const txHash = 'withdrawal_tx_1234567890123456789012345678901234567890123456';

      // Create first withdrawal with txHash
      await createTestWithdrawal({
        userId: user.id,
        txHash,
      });

      // Attempt to create another withdrawal with same txHash should fail
      await expect(
        createTestWithdrawal({
          userId: user.id,
          txHash,
        }),
      ).rejects.toThrow();

      // Verify only one withdrawal with this txHash
      const withdrawals = await prisma.withdrawal.findMany({
        where: { txHash },
      });

      expect(withdrawals).toHaveLength(1);
    });

    it('handles concurrent withdrawal submission with same txHash', async () => {
      const user = await createTestUser();
      const txHash = 'concurrent_withdrawal_tx_12345678901234567890123456789012345';

      // Simulate concurrent attempts to create withdrawal with same txHash
      const results = await Promise.allSettled([
        prisma.withdrawal.create({
          data: {
            userId: user.id,
            amount: BigInt(10_000_000),
            fee: BigInt(100_000),
            txHash,
            status: 'PENDING',
          },
        }),
        prisma.withdrawal.create({
          data: {
            userId: user.id,
            amount: BigInt(10_000_000),
            fee: BigInt(100_000),
            txHash,
            status: 'PENDING',
          },
        }),
      ]);

      // One should succeed, one should fail with P2002
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Verify the rejection is due to unique constraint
      const error = rejected[0].reason;
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');

      // Verify only one withdrawal was created
      const withdrawals = await prisma.withdrawal.findMany({
        where: { txHash },
      });

      expect(withdrawals).toHaveLength(1);
    });

    it('allows multiple withdrawals for same user with different txHashes', async () => {
      const user = await createTestUser();

      const withdrawal1 = await createTestWithdrawal({
        userId: user.id,
        txHash: 'tx_withdrawal_1_1234567890123456789012345678901234567890',
      });

      const withdrawal2 = await createTestWithdrawal({
        userId: user.id,
        txHash: 'tx_withdrawal_2_1234567890123456789012345678901234567890',
      });

      expect(withdrawal1.userId).toBe(user.id);
      expect(withdrawal2.userId).toBe(user.id);

      // Verify both exist
      const userWithdrawals = await prisma.withdrawal.findMany({
        where: { userId: user.id },
      });

      expect(userWithdrawals).toHaveLength(2);
    });
  });

  describe('Withdrawal-User Relationship', () => {
    it('establishes relationship with user', async () => {
      const user = await createTestUser({ displayName: 'Test Withdrawer' });
      const withdrawal = await createTestWithdrawal({ userId: user.id });

      // Verify relationship from withdrawal side
      const withdrawalWithUser = await prisma.withdrawal.findUnique({
        where: { id: withdrawal.id },
        include: { user: { select: { id: true, displayName: true } } },
      });

      expect(withdrawalWithUser?.user).toBeDefined();
      expect(withdrawalWithUser?.user.id).toBe(user.id);
      expect(withdrawalWithUser?.user.displayName).toBe('Test Withdrawer');

      // Verify relationship from user side
      const userWithWithdrawals = await prisma.user.findUnique({
        where: { id: user.id },
        include: { withdrawals: true },
      });

      expect(userWithWithdrawals?.withdrawals).toHaveLength(1);
      expect(userWithWithdrawals?.withdrawals[0].id).toBe(withdrawal.id);
    });

    it('cascades delete when user is deleted', async () => {
      const user = await createTestUser();
      const withdrawal = await createTestWithdrawal({ userId: user.id });

      // Delete user
      await prisma.user.delete({ where: { id: user.id } });

      // Withdrawal should be deleted due to cascade
      const withdrawalAfterDelete = await prisma.withdrawal.findUnique({
        where: { id: withdrawal.id },
      });

      expect(withdrawalAfterDelete).toBeNull();
    });
  });

  describe('Withdrawal Status Transitions', () => {
    it('creates withdrawal with PENDING status by default', async () => {
      const user = await createTestUser();

      const withdrawal = await prisma.withdrawal.create({
        data: {
          userId: user.id,
          amount: BigInt(5_000_000),
          fee: BigInt(50_000),
        },
      });

      expect(withdrawal.status).toBe('PENDING');
      expect(withdrawal.confirmedAt).toBeNull();
    });

    it('transitions withdrawal from PENDING to CONFIRMED', async () => {
      const user = await createTestUser();
      const withdrawal = await createTestWithdrawal({
        userId: user.id,
        status: 'PENDING',
      });

      const confirmedAt = new Date();
      const updated = await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt,
        },
      });

      expect(updated.status).toBe('CONFIRMED');
      expect(updated.confirmedAt).toBeDefined();

      // Verify persistence
      const persisted = await prisma.withdrawal.findUnique({
        where: { id: withdrawal.id },
      });

      expect(persisted?.status).toBe('CONFIRMED');
      expect(persisted?.confirmedAt).toBeDefined();
    });

    it('transitions withdrawal from PENDING to FAILED', async () => {
      const user = await createTestUser();
      const withdrawal = await createTestWithdrawal({
        userId: user.id,
        status: 'PENDING',
      });

      const updated = await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: 'FAILED' },
      });

      expect(updated.status).toBe('FAILED');
      expect(updated.confirmedAt).toBeNull();
    });

    it('updates txHash when withdrawal is submitted', async () => {
      const user = await createTestUser();
      const withdrawal = await createTestWithdrawal({
        userId: user.id,
        txHash: null,
      });

      expect(withdrawal.txHash).toBeNull();

      const txHash = 'submitted_tx_hash_123456789012345678901234567890123456789';
      const updated = await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { txHash },
      });

      expect(updated.txHash).toBe(txHash);
    });
  });

  describe('Withdrawal Queries', () => {
    it('queries withdrawals by user', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await createTestWithdrawal({ userId: user1.id });
      await createTestWithdrawal({ userId: user1.id });
      await createTestWithdrawal({ userId: user2.id });

      const user1Withdrawals = await prisma.withdrawal.findMany({
        where: { userId: user1.id },
      });

      expect(user1Withdrawals).toHaveLength(2);
      expect(user1Withdrawals.every(w => w.userId === user1.id)).toBe(true);
    });

    it('queries withdrawals by status', async () => {
      const user = await createTestUser();

      await createTestWithdrawal({ userId: user.id, status: 'PENDING' });
      await createTestWithdrawal({ userId: user.id, status: 'CONFIRMED' });
      await createTestWithdrawal({ userId: user.id, status: 'PENDING' });
      await createTestWithdrawal({ userId: user.id, status: 'FAILED' });

      const pendingWithdrawals = await prisma.withdrawal.findMany({
        where: { status: 'PENDING' },
      });

      expect(pendingWithdrawals).toHaveLength(2);
      expect(pendingWithdrawals.every(w => w.status === 'PENDING')).toBe(true);
    });

    it('orders withdrawals by requested date descending', async () => {
      const user = await createTestUser();

      const w1 = await createTestWithdrawal({ userId: user.id });
      await new Promise(resolve => setTimeout(resolve, 10));
      const w2 = await createTestWithdrawal({ userId: user.id });
      await new Promise(resolve => setTimeout(resolve, 10));
      const w3 = await createTestWithdrawal({ userId: user.id });

      const withdrawals = await prisma.withdrawal.findMany({
        where: { userId: user.id },
        orderBy: { requestedAt: 'desc' },
      });

      // Most recent first
      expect(withdrawals[0].id).toBe(w3.id);
      expect(withdrawals[1].id).toBe(w2.id);
      expect(withdrawals[2].id).toBe(w1.id);
    });

    it('paginates withdrawal history', async () => {
      const user = await createTestUser();

      // Create multiple withdrawals
      for (let i = 0; i < 5; i++) {
        await createTestWithdrawal({ userId: user.id });
      }

      // Query with pagination
      const page1 = await prisma.withdrawal.findMany({
        where: { userId: user.id },
        take: 2,
        skip: 0,
        orderBy: { requestedAt: 'desc' },
      });

      const page2 = await prisma.withdrawal.findMany({
        where: { userId: user.id },
        take: 2,
        skip: 2,
        orderBy: { requestedAt: 'desc' },
      });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);

      // Ensure no overlap
      const page1Ids = page1.map(w => w.id);
      const page2Ids = page2.map(w => w.id);
      const overlap = page1Ids.filter(id => page2Ids.includes(id));

      expect(overlap).toHaveLength(0);
    });

    it('queries withdrawals by txHash', async () => {
      const user = await createTestUser();
      const txHash = 'query_by_tx_1234567890123456789012345678901234567890123456';

      const withdrawal = await createTestWithdrawal({
        userId: user.id,
        txHash,
      });

      const found = await prisma.withdrawal.findUnique({
        where: { txHash },
      });

      expect(found).toBeDefined();
      expect(found?.id).toBe(withdrawal.id);
    });
  });

  describe('Withdrawal Amount and Fee Calculations', () => {
    it('stores withdrawal amount and fee separately', async () => {
      const user = await createTestUser();

      const withdrawal = await createTestWithdrawal({
        userId: user.id,
        amount: BigInt(10_000_000), // 10 XLM
        fee: BigInt(100_000), // 0.1 XLM
      });

      expect(withdrawal.amount).toBe(BigInt(10_000_000));
      expect(withdrawal.fee).toBe(BigInt(100_000));

      // Net amount would be amount - fee = 9,900,000 stroops
      const netAmount = withdrawal.amount - withdrawal.fee;
      expect(netAmount).toBe(BigInt(9_900_000));
    });

    it('calculates total withdrawn amount for user', async () => {
      const user = await createTestUser();

      await createTestWithdrawal({
        userId: user.id,
        amount: BigInt(5_000_000),
        status: 'CONFIRMED',
      });

      await createTestWithdrawal({
        userId: user.id,
        amount: BigInt(3_000_000),
        status: 'CONFIRMED',
      });

      await createTestWithdrawal({
        userId: user.id,
        amount: BigInt(2_000_000),
        status: 'PENDING', // Not confirmed yet
      });

      // Calculate total confirmed withdrawals
      const confirmedWithdrawals = await prisma.withdrawal.findMany({
        where: {
          userId: user.id,
          status: 'CONFIRMED',
        },
      });

      const totalWithdrawn = confirmedWithdrawals.reduce(
        (sum, w) => sum + w.amount,
        BigInt(0),
      );

      expect(totalWithdrawn).toBe(BigInt(8_000_000));
    });
  });

  describe('Withdrawal Balance Calculations', () => {
    it('calculates withdrawable balance from received tips', async () => {
      const creator = await createTestUser();

      // Create confirmed tips received by creator
      await createTestTip({
        toAddress: creator.stellarAddress,
        amountStroops: BigInt(5_000_000),
        status: 'CONFIRMED',
      });

      await createTestTip({
        toAddress: creator.stellarAddress,
        amountStroops: BigInt(3_000_000),
        status: 'CONFIRMED',
      });

      // Calculate total received
      const receivedTips = await prisma.tip.findMany({
        where: {
          toAddress: creator.stellarAddress,
          status: 'CONFIRMED',
        },
      });

      const totalReceived = receivedTips.reduce(
        (sum, tip) => sum + tip.amountStroops,
        BigInt(0),
      );

      expect(totalReceived).toBe(BigInt(8_000_000));
    });

    it('subtracts confirmed withdrawals from balance', async () => {
      const creator = await createTestUser();

      // Received tips
      await createTestTip({
        toAddress: creator.stellarAddress,
        amountStroops: BigInt(10_000_000),
        status: 'CONFIRMED',
      });

      // Withdrawn amount
      await createTestWithdrawal({
        userId: creator.id,
        amount: BigInt(3_000_000),
        status: 'CONFIRMED',
      });

      // Calculate balance
      const receivedTips = await prisma.tip.findMany({
        where: {
          toAddress: creator.stellarAddress,
          status: 'CONFIRMED',
        },
      });

      const withdrawals = await prisma.withdrawal.findMany({
        where: {
          userId: creator.id,
          status: 'CONFIRMED',
        },
      });

      const totalReceived = receivedTips.reduce(
        (sum, tip) => sum + tip.amountStroops,
        BigInt(0),
      );

      const totalWithdrawn = withdrawals.reduce(
        (sum, w) => sum + w.amount,
        BigInt(0),
      );

      const balance = totalReceived - totalWithdrawn;

      expect(balance).toBe(BigInt(7_000_000));
    });

    it('excludes pending withdrawals from available balance', async () => {
      const creator = await createTestUser();

      await createTestTip({
        toAddress: creator.stellarAddress,
        amountStroops: BigInt(10_000_000),
        status: 'CONFIRMED',
      });

      await createTestWithdrawal({
        userId: creator.id,
        amount: BigInt(2_000_000),
        status: 'PENDING', // Not yet confirmed
      });

      // Available balance should not include pending withdrawal
      const receivedTips = await prisma.tip.findMany({
        where: {
          toAddress: creator.stellarAddress,
          status: 'CONFIRMED',
        },
      });

      const confirmedWithdrawals = await prisma.withdrawal.findMany({
        where: {
          userId: creator.id,
          status: 'CONFIRMED',
        },
      });

      const totalReceived = receivedTips.reduce(
        (sum, tip) => sum + tip.amountStroops,
        BigInt(0),
      );

      const totalWithdrawn = confirmedWithdrawals.reduce(
        (sum, w) => sum + w.amount,
        BigInt(0),
      );

      const availableBalance = totalReceived - totalWithdrawn;

      expect(availableBalance).toBe(BigInt(10_000_000));
    });
  });
});
