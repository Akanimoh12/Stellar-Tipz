import { prisma } from '../../db/prisma.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/AppError.js';
import { handleUniqueConstraintViolation } from '../../common/utils/prisma-errors.js';
import type { RefundResponse } from './refunds.types.js';
import type { Prisma } from '@prisma/client';
import {
  createCursorScope,
  descendingCursorCondition,
  toCursorPage,
} from '../../common/pagination/cursor.js';

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
 * 
 * Race-safe: if two concurrent requests try to create a refund for the same tip,
 * the database unique constraint on tipId ensures only one succeeds. The losing
 * request catches the P2002 error and returns a clean 409 Conflict.
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

  // Attempt to create the refund directly. If a concurrent request already
  // created one, Prisma will throw a P2002 unique constraint violation on tipId.
  try {
    const refund = await prisma.refund.create({
      data: {
        tipId: tip.id,
        amount: tip.amountStroops,
        reason,
        status: 'pending',
      },
    });

    return serializeRefund(refund);
  } catch (err) {
    handleUniqueConstraintViolation(err, 'A refund has already been requested for this tip');
  }
}

/**
 * GET /refunds/me — paginated refund history for tips sent by the
 * authenticated user, most recent first.
 */
export async function getMyRefunds(
  userId: string,
  limit: number,
  cursor?: string,
  offset?: number,
): Promise<{ data: RefundResponse[]; nextCursor: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new BadRequestError('User not found');

  const scope = createCursorScope('refunds', { userId });
  const cursorCondition = descendingCursorCondition('createdAt', cursor, scope);
  const baseWhere: Prisma.RefundWhereInput = { tip: { fromAddress: user.stellarAddress } };
  const where: Prisma.RefundWhereInput = cursorCondition
    ? { AND: [baseWhere, cursorCondition as Prisma.RefundWhereInput] }
    : baseWhere;
  const refunds = await prisma.refund.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(offset !== undefined ? { skip: offset } : {}),
    take: limit + 1,
  });
  const page = toCursorPage(refunds, limit, scope, (refund) => refund.createdAt);

  return {
    data: page.data.map(serializeRefund),
    nextCursor: page.nextCursor,
  };
}
