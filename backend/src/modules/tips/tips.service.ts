import { Contract, TransactionBuilder, SorobanRpc, nativeToScVal, Networks } from '@stellar/stellar-sdk';
import { Prisma } from '@prisma/client';
import { config } from '../../config/index.js';
import { prisma } from '../../db/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import { TipStatus } from '../../types/enums.js';
import type { RecordTipInput } from './tips.schema.js';
import { serializeTip } from './tips.serializer.js';
import type { TipResponseDto } from './tips.dto.js';

export type { TipResponseDto };

export interface GetTipsParams {
  cursor?: string;
  limit: number;
  address?: string;
  direction?: string;
}

export interface PreparedTip {
  unsignedTxXdr: string;
  from: string;
  to: string;
  amount: string;
  contractId: string;
  networkPassphrase: string;
}

export interface PaginatedTips {
  data: TipResponseDto[];
  nextCursor: string | null;
}

export async function getPaginatedTips(
  params: GetTipsParams,
): Promise<PaginatedTips> {
  const where: Record<string, unknown> = {};
  if (params.address) {
    if (params.direction === 'sent') {
      where.fromAddress = { equals: params.address, mode: 'insensitive' };
    } else if (params.direction === 'received') {
      where.toAddress = { equals: params.address, mode: 'insensitive' };
    } else {
      where.OR = [
        { fromAddress: { equals: params.address, mode: 'insensitive' } },
        { toAddress: { equals: params.address, mode: 'insensitive' } },
      ];
    }
  }

  const findManyArgs: Parameters<typeof prisma.tip.findMany>[0] = {
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: params.limit + 1,
  };

  if (params.cursor) {
    findManyArgs.cursor = { id: params.cursor };
    findManyArgs.skip = 1;
  }

  const tips = await prisma.tip.findMany(findManyArgs);

  const hasMore = tips.length > params.limit;
  const results = hasMore ? tips.slice(0, params.limit) : tips;

  const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].id : null;

  return {
    data: results.map(serializeTip),
    nextCursor,
  };
}

export async function prepareTip(
  from: string,
  to: string,
  amount: string,
  message?: string,
): Promise<PreparedTip> {
  const contractId = config.stellar.contractId;
  if (!contractId) {
    throw new BadRequestError('Contract ID is not configured');
  }

  const server = new SorobanRpc.Server(config.stellar.rpcUrl, {
    allowHttp: config.stellar.rpcUrl.startsWith('http://'),
  });

  const sourceAccount = await server.getAccount(from).catch(() => {
    throw new BadRequestError('Source account not found on network');
  });

  const networkPassphrase = Networks[config.stellar.network as keyof typeof Networks] ?? config.stellar.networkPassphrase;

  const scParams = [
    nativeToScVal(from, { type: 'address' }),
    nativeToScVal(to, { type: 'address' }),
    nativeToScVal(amount, { type: 'i128' }),
  ];
  if (message) {
    scParams.push(nativeToScVal(message, { type: 'string' }));
  }

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(contract.call('tip', ...scParams))
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
    from,
    to,
    amount,
    contractId,
    networkPassphrase,
  };
}

/** GET /tips/:id — fetch a single tip by its id. */
export async function getTipById(id: string): Promise<TipResponseDto> {
  const tip = await prisma.tip.findUnique({ where: { id } });
  if (!tip) throw new NotFoundError('Tip not found');
  return serializeTip(tip);
}

/** Shared cursor-paginated list query, newest first. */
async function listTips(
  where: Prisma.TipWhereInput,
  limit: number,
  cursor?: string,
): Promise<PaginatedTips> {
  const rows = await prisma.tip.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    data: page.map(serializeTip),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/** GET /profiles/:username/tips — tips received by the profile with this username. */
export async function getTipsReceivedByUsername(
  username: string,
  limit: number,
  cursor?: string,
): Promise<PaginatedTips> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.deletedAt) throw new NotFoundError('Profile not found');
  return listTips({ toAddress: user.stellarAddress }, limit, cursor);
}

/** GET /users/me/tips/sent — tips sent by the authenticated user's address. */
export async function getTipsSentByAddress(
  fromAddress: string,
  limit: number,
  cursor?: string,
): Promise<PaginatedTips> {
  return listTips({ fromAddress }, limit, cursor);
}

/**
 * POST /tips — record an on-chain tip, idempotent by txHash.
 * If a tip with the given txHash already exists the existing record is returned
 * instead of inserting a duplicate. A Prisma P2002 unique-constraint violation
 * (from a concurrent insert) is handled the same way.
 */
export async function recordTip(input: RecordTipInput): Promise<TipResponseDto> {
  const existing = await prisma.tip.findUnique({ where: { txHash: input.txHash } });
  if (existing) return serializeTip(existing);

  try {
    const tip = await prisma.tip.create({
      data: {
        txHash: input.txHash,
        ledger: input.ledger,
        fromAddress: input.fromAddress,
        toAddress: input.toAddress,
        amountStroops: BigInt(input.amountStroops),
        message: input.message,
      },
    });
    return serializeTip(tip);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const tip = await prisma.tip.findUnique({ where: { txHash: input.txHash } });
      if (tip) return serializeTip(tip);
    }
    throw err;
  }
}

/**
 * PATCH /tips/:txHash/confirm — transition a tip from PENDING to CONFIRMED.
 * Idempotent: calling on an already-CONFIRMED tip is a no-op.
 */
export async function confirmTip(txHash: string): Promise<TipResponseDto> {
  const tip = await prisma.tip.findUnique({ where: { txHash } });
  if (!tip) throw new NotFoundError('Tip not found');
  if (tip.status === TipStatus.CONFIRMED) return serializeTip(tip);
  const updated = await prisma.tip.update({
    where: { txHash },
    data: { status: TipStatus.CONFIRMED },
  });
  return serializeTip(updated);
}
