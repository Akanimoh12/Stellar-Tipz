import type { Withdrawal } from "@prisma/client";
import { prisma } from "@/db/prisma.js";
import { logger } from "@/common/utils/logger.js";
import { NotFoundError } from "@/common/errors/AppError.js";
import type { CreateWithdrawalInput } from "./withdrawals.schema.js";
import type { WithdrawalResponse } from "./withdrawals.types.js";

function toResponse(withdrawal: Withdrawal): WithdrawalResponse {
  return {
    id: withdrawal.id,
    userId: withdrawal.userId,
    amount: withdrawal.amount.toString(),
    fee: withdrawal.fee.toString(),
    status: withdrawal.status,
    txHash: withdrawal.txHash,
    requestedAt: withdrawal.requestedAt.toISOString(),
    confirmedAt: withdrawal.confirmedAt?.toISOString() ?? null,
  };
}

/**
 * Creates a withdrawal request for a user (#942).
 * `input.amount` has already been validated against the configured minimum
 * by `createWithdrawalSchema`.
 */
export async function requestWithdrawal(
  userId: string,
  input: CreateWithdrawalInput,
): Promise<WithdrawalResponse> {
  const withdrawal = await prisma.withdrawal.create({
    data: {
      userId,
      amount: BigInt(input.amount),
      fee: 0n,
    },
  });

  logger.info(
    { userId, withdrawalId: withdrawal.id, amount: input.amount },
    "Withdrawal requested",
  );

  return toResponse(withdrawal);
}

/**
 * Gets a single withdrawal owned by the user.
 */
export async function getWithdrawalById(
  id: string,
  userId: string,
): Promise<WithdrawalResponse> {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id } });

  if (!withdrawal || withdrawal.userId !== userId) {
    throw new NotFoundError("Withdrawal not found");
  }

  return toResponse(withdrawal);
}

/**
 * Lists all withdrawals for a user, most recent first.
 */
export async function listWithdrawals(userId: string): Promise<WithdrawalResponse[]> {
  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
  });

  return withdrawals.map(toResponse);
}

/**
 * Updates a withdrawal's status from an on-chain confirmation (#943).
 *
 * This is the integration seam for the indexer: once the indexer module
 * observes `txHash` land on-chain (or fail), it calls this to transition the
 * withdrawal out of PENDING. Not exposed over HTTP — only the indexer should
 * be able to confirm a withdrawal.
 */
export async function updateWithdrawalStatus(
  withdrawalId: string,
  status: "CONFIRMED" | "FAILED",
  txHash: string,
): Promise<WithdrawalResponse> {
  const withdrawal = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
  });

  if (!withdrawal) {
    throw new NotFoundError("Withdrawal not found");
  }

  const updated = await prisma.withdrawal.update({
    where: { id: withdrawalId },
    data: {
      status,
      txHash,
      confirmedAt: status === "CONFIRMED" ? new Date() : withdrawal.confirmedAt,
    },
  });

  logger.info({ withdrawalId, status, txHash }, "Withdrawal status updated by indexer");

  return toResponse(updated);
import { Contract, TransactionBuilder, SorobanRpc, nativeToScVal, Networks } from '@stellar/stellar-sdk';
import { config } from '../../config/index.js';
import { prisma } from '../../db/prisma.js';
import { BadRequestError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import type { WithdrawalResponse, WithdrawableBalanceResponse } from './withdrawals.types.js';

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

export async function getWithdrawableBalance(userId: string): Promise<WithdrawableBalanceResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new BadRequestError('User not found');

  const [tipsResult, withdrawalsResult] = await Promise.all([
    prisma.tip.aggregate({
      where: { toAddress: user.stellarAddress, status: 'CONFIRMED' },
      _sum: { amountStroops: true },
    }),
    prisma.withdrawal.aggregate({
      where: { userId, status: { in: ['PENDING', 'CONFIRMED'] } },
      _sum: { amount: true },
    }),
  ]);

  const totalReceived = tipsResult._sum.amountStroops ?? BigInt(0);
  const totalWithdrawn = withdrawalsResult._sum.amount ?? BigInt(0);

  const withdrawableBalance = totalReceived > totalWithdrawn ? totalReceived - totalWithdrawn : BigInt(0);

  return {
    stellarAddress: user.stellarAddress,
    totalReceived: totalReceived.toString(),
    totalWithdrawn: totalWithdrawn.toString(),
    withdrawableBalance: withdrawableBalance.toString(),
  };
}

export interface PreparedWithdrawal {
  unsignedTxXdr: string;
  destination: string;
  amount: string;
  contractId: string;
  networkPassphrase: string;
}

export async function prepareWithdrawal(userId: string, amount: string): Promise<PreparedWithdrawal> {
  const contractId = config.stellar.contractId;
  if (!contractId) {
    throw new BadRequestError('Contract ID is not configured');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new BadRequestError('User not found');

  const balance = await getWithdrawableBalance(userId);
  const parsedAmount = BigInt(amount);
  if (parsedAmount <= 0) {
    throw new BadRequestError('Withdrawal amount must be positive');
  }
  if (parsedAmount > BigInt(balance.withdrawableBalance)) {
    throw new BadRequestError('Insufficient balance');
  }

  const server = new SorobanRpc.Server(config.stellar.rpcUrl, {
    allowHttp: config.stellar.rpcUrl.startsWith('http://'),
  });

  const sourceAccount = await server.getAccount(user.stellarAddress).catch(() => {
    throw new BadRequestError('Source account not found on network');
  });

  const networkPassphrase = Networks[config.stellar.network as keyof typeof Networks] ?? config.stellar.networkPassphrase;

  const scParams = [
    nativeToScVal(user.stellarAddress, { type: 'address' }),
    nativeToScVal(amount, { type: 'i128' }),
  ];

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(contract.call('withdraw', ...scParams))
    .setTimeout(30)
    .build();

  const simulateResponse = await server.simulateTransaction(tx).catch((err: Error) => {
    logger.error({ err }, 'Transaction simulation failed');
    throw new BadRequestError('Transaction simulation failed');
  });

  if (SorobanRpc.Api.isSimulationError(simulateResponse)) {
    throw new BadRequestError(`Simulation error: ${simulateResponse.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simulateResponse);
  const unsignedTxXdr = prepared.build().toEnvelope().toXDR('base64');

  return {
    unsignedTxXdr,
    destination: user.stellarAddress,
    amount,
    contractId,
    networkPassphrase,
  };
}
