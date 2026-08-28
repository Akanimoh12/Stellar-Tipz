import {
  Contract,
  TransactionBuilder,
  SorobanRpc,
  nativeToScVal,
  Networks,
} from '@stellar/stellar-sdk';
import { prisma } from '../../db/prisma.js';
import { config } from '../../config/index.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import { handleUniqueConstraintViolation } from '../../common/utils/prisma-errors.js';
import type { Prisma } from '@prisma/client';
import {
  createCursorScope,
  descendingCursorCondition,
  toCursorPage,
} from '../../common/pagination/cursor.js';
import type {
  PreparedRefundTx,
  RefundResponse,
  SubmittedRefundResolution,
} from './refunds.types.js';

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

function getServer(): SorobanRpc.Server {
  return new SorobanRpc.Server(config.stellar.rpcUrl, {
    allowHttp: config.stellar.rpcUrl.startsWith('http://'),
  });
}

function getNetworkPassphrase(): string {
  return (
    Networks[config.stellar.network as keyof typeof Networks] ?? config.stellar.networkPassphrase
  );
}

function parseContractTipId(tipId: string): number {
  const parsed = Number(tipId);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 4_294_967_295) {
    throw new BadRequestError('Refund tip is missing a numeric on-chain tip id');
  }
  return parsed;
}

async function loadPendingRefundForCreator(refundId: string, creatorId: string) {
  const creator = await prisma.user.findUnique({ where: { id: creatorId } });
  if (!creator) throw new BadRequestError('User not found');

  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { tip: true },
  });
  if (!refund) throw new NotFoundError('Refund not found');

  if (refund.tip.toAddress !== creator.stellarAddress) {
    throw new ForbiddenError('Only the tip recipient can resolve this refund');
  }
  if (refund.status !== 'pending') {
    throw new ConflictError('Only pending refunds can be resolved');
  }

  return { creator, refund, contractTipId: parseContractTipId(refund.tipId) };
}

async function prepareRefundResolutionTx(
  creatorAddress: string,
  contractTipId: number,
  method: 'approve_refund' | 'reject_refund',
): Promise<PreparedRefundTx> {
  const contractId = config.stellar.contractId;
  if (!contractId) throw new BadRequestError('Contract ID is not configured');

  const server = getServer();
  const sourceAccount = await server.getAccount(creatorAddress).catch(() => {
    throw new BadRequestError('Source account not found on network');
  });
  const networkPassphrase = getNetworkPassphrase();

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(sourceAccount, { fee: '100', networkPassphrase })
    .addOperation(
      contract.call(
        method,
        nativeToScVal(creatorAddress, { type: 'address' }),
        nativeToScVal(contractTipId, { type: 'u32' }),
      ),
    )
    .setTimeout(30)
    .build();

  const simulateResponse = await server.simulateTransaction(tx).catch((err: Error) => {
    logger.error({ err, method }, 'Refund resolution simulation failed');
    throw new BadRequestError('Transaction simulation failed');
  });

  if (SorobanRpc.Api.isSimulationError(simulateResponse)) {
    throw new BadRequestError(`Simulation error: ${simulateResponse.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simulateResponse);

  return {
    unsignedTxXdr: prepared.build().toEnvelope().toXDR('base64'),
    contractId,
    networkPassphrase,
  };
}

async function submitRefundResolutionTx(
  refundId: string,
  creatorId: string,
  signedTxXdr: string,
  status: 'approved' | 'rejected',
  reason?: string,
): Promise<SubmittedRefundResolution> {
  await loadPendingRefundForCreator(refundId, creatorId);

  const networkPassphrase = getNetworkPassphrase();
  const tx = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);
  const server = getServer();
  const sendResponse = await server.sendTransaction(tx).catch((err: Error) => {
    logger.error({ err, refundId, status }, 'Refund resolution submission failed');
    throw new BadRequestError('Failed to submit refund transaction');
  });

  if (sendResponse.status === 'ERROR') {
    logger.error(
      { hash: sendResponse.hash, refundId },
      'Refund resolution transaction rejected by the network',
    );
    throw new BadRequestError('Transaction rejected by the network');
  }

  const refund = await prisma.refund.update({
    where: { id: refundId },
    data: {
      status,
      txHash: sendResponse.hash,
      ...(status === 'rejected' && reason ? { reason } : {}),
    },
  });

  return { id: refund.id, status: refund.status, txHash: sendResponse.hash };
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

/** GET /refunds/received — pending and historical refunds for tips received by the creator. */
export async function getReceivedRefunds(
  creatorId: string,
  limit: number,
  offset: number,
): Promise<RefundResponse[]> {
  const creator = await prisma.user.findUnique({ where: { id: creatorId } });
  if (!creator) throw new BadRequestError('User not found');

  const refunds = await prisma.refund.findMany({
    where: { tip: { toAddress: creator.stellarAddress } },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  });

  return refunds.map(serializeRefund);
}

/** POST /refunds/:id/approve — prepare an unsigned approve_refund tx. */
export async function prepareApproveRefund(
  creatorId: string,
  refundId: string,
): Promise<PreparedRefundTx> {
  const { creator, contractTipId } = await loadPendingRefundForCreator(refundId, creatorId);
  return prepareRefundResolutionTx(creator.stellarAddress, contractTipId, 'approve_refund');
}

/** POST /refunds/:id/reject — prepare an unsigned reject_refund tx. */
export async function prepareRejectRefund(
  creatorId: string,
  refundId: string,
): Promise<PreparedRefundTx> {
  const { creator, contractTipId } = await loadPendingRefundForCreator(refundId, creatorId);
  return prepareRefundResolutionTx(creator.stellarAddress, contractTipId, 'reject_refund');
}

/** POST /refunds/:id/approve/submit — submit signed approve_refund tx. */
export async function submitApproveRefund(
  creatorId: string,
  refundId: string,
  signedTxXdr: string,
): Promise<SubmittedRefundResolution> {
  return submitRefundResolutionTx(refundId, creatorId, signedTxXdr, 'approved');
}

/** POST /refunds/:id/reject/submit — submit signed reject_refund tx. */
export async function submitRejectRefund(
  creatorId: string,
  refundId: string,
  signedTxXdr: string,
  reason: string,
): Promise<SubmittedRefundResolution> {
  return submitRefundResolutionTx(refundId, creatorId, signedTxXdr, 'rejected', reason);
}
