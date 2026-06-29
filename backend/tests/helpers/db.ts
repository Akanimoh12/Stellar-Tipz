import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Truncates all application tables in dependency-safe order.
 * Call this in `beforeEach` to guarantee a clean DB state per test.
 *
 * @example
 * import { resetDb } from './helpers/db';
 * beforeEach(resetDb);
 */
export async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.withdrawal.deleteMany(),
    prisma.creditScoreHistory.deleteMany(),
    prisma.creditScore.deleteMany(),
    prisma.leaderboardSnapshot.deleteMany(),
    prisma.streak.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.tip.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.authChallenge.deleteMany(),
    prisma.indexerCursor.deleteMany(),
    prisma.xAccount.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export { prisma };
