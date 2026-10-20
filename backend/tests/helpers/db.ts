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
    prisma.refund.deleteMany(),
    prisma.tip.deleteMany(),
    prisma.eventLog.deleteMany(),
    prisma.indexerCursor.deleteMany(),
    prisma.xAccount.deleteMany(),
  ]);
}

export { prisma };