import { prisma } from './setup.js';
import type { User, Tip, Refund, Withdrawal } from '@prisma/client';

/**
 * Test data factory helpers for integration tests.
 * These create real records in the database.
 */

export interface CreateUserOptions {
  stellarAddress?: string;
  username?: string;
  displayName?: string;
  bio?: string;
  role?: string;
  scopes?: string[];
}

/**
 * Creates a test user in the database.
 */
export async function createTestUser(options: CreateUserOptions = {}): Promise<User> {
  const stellarAddress = options.stellarAddress || `G${randomString(55)}`;
  
  return prisma.user.create({
    data: {
      stellarAddress,
      username: options.username,
      displayName: options.displayName || 'Test User',
      bio: options.bio,
      role: options.role || 'user',
      scopes: options.scopes || [],
    },
  });
}

export interface CreateTipOptions {
  fromAddress?: string;
  toAddress?: string;
  amountStroops?: bigint;
  txHash?: string;
  ledger?: number;
  status?: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED';
  message?: string;
}

/**
 * Creates a test tip in the database.
 */
export async function createTestTip(options: CreateTipOptions = {}): Promise<Tip> {
  const txHash = options.txHash || randomTxHash();
  
  return prisma.tip.create({
    data: {
      txHash,
      ledger: options.ledger || randomLedger(),
      fromAddress: options.fromAddress || `G${randomString(55)}`,
      toAddress: options.toAddress || `G${randomString(55)}`,
      amountStroops: options.amountStroops || BigInt(1_000_000),
      status: options.status || 'CONFIRMED',
      message: options.message,
    },
  });
}

export interface CreateRefundOptions {
  tipId: string;
  amount?: bigint;
  reason?: string;
  status?: string;
}

/**
 * Creates a test refund in the database.
 */
export async function createTestRefund(options: CreateRefundOptions): Promise<Refund> {
  return prisma.refund.create({
    data: {
      tipId: options.tipId,
      amount: options.amount || BigInt(1_000_000),
      reason: options.reason || 'Test refund',
      status: options.status || 'pending',
    },
  });
}

export interface CreateWithdrawalOptions {
  userId: string;
  amount?: bigint;
  fee?: bigint;
  txHash?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'FAILED';
}

/**
 * Creates a test withdrawal in the database.
 */
export async function createTestWithdrawal(options: CreateWithdrawalOptions): Promise<Withdrawal> {
  return prisma.withdrawal.create({
    data: {
      userId: options.userId,
      amount: options.amount || BigInt(10_000_000),
      fee: options.fee || BigInt(100_000),
      txHash: options.txHash,
      status: options.status || 'PENDING',
    },
  });
}

/**
 * Creates a test auth challenge in the database.
 */
export async function createTestChallenge(stellarAddress: string, challenge?: string) {
  const challengeStr = challenge || randomString(64);
  const expiresAt = new Date(Date.now() + 300_000); // 5 minutes

  return prisma.authChallenge.create({
    data: {
      stellarAddress,
      challenge: challengeStr,
      network: 'TESTNET',
      expiresAt,
    },
  });
}

/**
 * Creates a test refresh token in the database.
 */
export async function createTestRefreshToken(userId: string, hashedToken: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  return prisma.refreshToken.create({
    data: {
      userId,
      hashedToken,
      expiresAt,
    },
  });
}

/**
 * Generates a random string of specified length.
 */
function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a random transaction hash (64 hex chars).
 */
function randomTxHash(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a random ledger number.
 */
function randomLedger(): number {
  return Math.floor(Math.random() * 1_000_000) + 1_000_000;
}

/**
 * Wait for a specified number of milliseconds.
 * Useful for testing time-based behavior.
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Assert that a promise rejects with a specific error.
 */
export async function expectRejection<T>(
  promise: Promise<T>,
  expectedMessage?: string,
): Promise<Error> {
  try {
    await promise;
    throw new Error('Expected promise to reject but it resolved');
  } catch (error) {
    if (expectedMessage && error instanceof Error) {
      if (!error.message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to include "${expectedMessage}" but got "${error.message}"`,
        );
      }
    }
    return error as Error;
  }
}
