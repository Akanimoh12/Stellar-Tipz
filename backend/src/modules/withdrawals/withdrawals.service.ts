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

  return withdrawals.map((withdrawal) => ({
    id: withdrawal.id,
    amount: withdrawal.amount.toString(),
    fee: withdrawal.fee.toString(),
    txHash: withdrawal.txHash,
    status: withdrawal.status,
    requestedAt: withdrawal.requestedAt.toISOString(),
    confirmedAt: withdrawal.confirmedAt ? withdrawal.confirmedAt.toISOString() : null,
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
  const withdrawableBalance =
    totalReceived > totalWithdrawn ? totalReceived - totalWithdrawn : BigInt(0);

  return {
    stellarAddress: user.stellarAddress,
    totalReceived: totalReceived.toString(),
    totalWithdrawn: totalWithdrawn.toString(),
    withdrawableBalance: withdrawableBalance.toString(),
  };
}

const BPS_DIVISOR = BigInt(10_000);

export interface WithdrawalFee {
  fee: bigint;
  netAmount: bigint;
}

/**
 * Pure function: split a gross withdrawal amount into the platform fee and
 * the net amount the user receives. Fee is floored so the platform never
 * rounds in its own favour beyond the configured rate.
 */
export function calculateWithdrawalFee(
  amount: bigint,
  feeBps: number = config.withdrawals.feeBps,
): WithdrawalFee {
  if (amount <= BigInt(0)) {
    throw new BadRequestError('Withdrawal amount must be positive');
  }
  const fee = (amount * BigInt(feeBps)) / BPS_DIVISOR;
  return { fee, netAmount: amount - fee };
}

export interface PreparedWithdrawal {
  unsignedTxXdr: string;
  destination: string;
  amount: string;
  fee: string;
  netAmount: string;
  contractId: string;
  networkPassphrase: string;
}

export async function prepareWithdrawal(
  userId: string,
  amount: string,
): Promise<PreparedWithdrawal> {
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

  const { fee, netAmount } = calculateWithdrawalFee(parsedAmount);

  const server = new SorobanRpc.Server(config.stellar.rpcUrl, {
    allowHttp: config.stellar.rpcUrl.startsWith('http://'),
  });

  const sourceAccount = await server.getAccount(user.stellarAddress).catch(() => {
    throw new BadRequestError('Source account not found on network');
  });
  const networkPassphrase =
    Networks[config.stellar.network as keyof typeof Networks] ?? config.stellar.networkPassphrase;

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        'withdraw',
        nativeToScVal(user.stellarAddress, { type: 'address' }),
        nativeToScVal(netAmount.toString(), { type: 'i128' }),
      ),
    )
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

  return {
    unsignedTxXdr: prepared.build().toEnvelope().toXDR('base64'),
    destination: user.stellarAddress,
    amount,
    fee: fee.toString(),
    netAmount: netAmount.toString(),
    contractId,
    networkPassphrase,
  };
}
