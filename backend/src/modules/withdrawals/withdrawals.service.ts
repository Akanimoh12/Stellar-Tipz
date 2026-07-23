import { prisma } from '../../db/prisma.js';
import type { WithdrawalResponse } from './withdrawals.types.js';

export async function getWithdrawalHistory(
  userId: string,
  limit: number,
  offset: number,
): Promise<WithdrawalResponse[]> {
  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { requestedAt: 'desc' },
    skip: offset,
    take: limit,
  });

  return withdrawals.map((w) => ({
    id: w.id,
    amount: w.amount.toString(),
    fee: w.fee.toString(),
    txHash: w.txHash,
    status: w.status,
    requestedAt: w.requestedAt.toISOString(),
    confirmedAt: w.confirmedAt ? w.confirmedAt.toISOString() : null,
  }));
}
