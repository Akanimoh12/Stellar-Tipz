import { prisma } from '../../db/prisma.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/AppError.js';
import type { RefundResponse } from './refunds.types.js';

interface RefundRecord {
  id: string;
  tipId: string;
  amount: bigint;
  reason: string;
  status: string;
  txHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function serializeRefund(refund: RefundRecord): RefundResponse {
  return {
    id: refund.id,
    tipId: refund.tipId,
    amountStroops: refund.amount.toString(),
    reason: refund.reason,
    status: refund.status,
    txHash: refund.txHash,
    createdAt: refund.createdAt.toISOString(),
    updatedAt: refund.updatedAt.toISOString(),
  };
}

/**
 * POST /refunds/request — request a refund for a confirmed tip sent by the
 * authenticated user. One refund request is allowed per tip.
 */
export async function requestRefund(
  userId: string,
  tipTxHash: string,
  reason: string,
): Promise<RefundResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new BadRequestError('User not found');

  const tip = await prisma.tip.findUnique({ where: { txHash: tipTxHash } });
  if (!tip) throw new NotFoundError('Tip not found');

  if (tip.fromAddress !== user.stellarAddress) {
    throw new ForbiddenError('You can only request a refund for tips you sent');
  }

  if (tip.status !== 'CONFIRMED') {
    throw new BadRequestError('Only confirmed tips can be refunded');
  }

  const existing = await prisma.refund.findUnique({ where: { tipId: tip.id } });
  if (existing) {
    throw new ConflictError('A refund has already been requested for this tip');
  }

  const refund = await prisma.refund.create({
    data: {
      tipId: tip.id,
      amount: tip.amountStroops,
      reason,
      status: 'pending',
    },
  });

  return serializeRefund(refund);
}

/**
 * GET /refunds/me — paginated refund history for tips sent by the
 * authenticated user, most recent first.
 */
export async function getMyRefunds(
  userId: string,
  limit: number,
  offset: number,
): Promise<RefundResponse[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new BadRequestError('User not found');

  const refunds = await prisma.refund.findMany({
    where: { tip: { fromAddress: user.stellarAddress } },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  });

  return refunds.map(serializeRefund);
}
