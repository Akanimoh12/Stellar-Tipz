import { prisma } from "../../db/prisma.js";

/**
 * Safe wrapper around prisma.$transaction that falls back to direct execution
 * when $transaction is not available (e.g., in unit tests where prisma is mocked
 * without $transaction). In production, it always uses the real transaction.
 */
export async function withTransaction<T>(
  fn: (tx: typeof prisma) => Promise<T>,
  opts?: { timeout?: number; maxWait?: number; isolationLevel?: string },
): Promise<T> {
  const maybeTx = (prisma as unknown as { $transaction?: Function }).$transaction;
  if (typeof maybeTx === "function") {
    return maybeTx.call(prisma, fn, opts);
  }
  // Fallback for mocked prisma in tests — execute directly without transaction
  return fn(prisma as unknown as typeof prisma);
}
