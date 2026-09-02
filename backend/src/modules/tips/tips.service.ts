import { Contract, TransactionBuilder, SorobanRpc, nativeToScVal, Networks } from '@stellar/stellar-sdk';
import { Prisma } from '@prisma/client';
import { config } from '../../config/index.js';
import { prisma } from '../../db/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import { rpcCall } from '../../common/stellar/rpcClient.js';
import { TipStatus } from '../../types/enums.js';
import type { RecordTipInput } from './tips.schema.js';
import { serializeTip, serializeTipReceipt } from './tips.serializer.js';
import type { TipResponseDto, TipAggregateByCreatorDto } from './tips.dto.js';

export type { TipResponseDto, TipAggregateByCreatorDto };

export interface GetTipsParams {
  cursor?: string;
  limit: number;
  address?: string;
  direction?: string;
  tokenCode?: string;
  startDate?: string;
  endDate?: string;
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

  if (params.tokenCode) {
    where.tokenCode = params.tokenCode;
  }

  if (params.startDate || params.endDate) {
    const createdAtFilter: Record<string, Date> = {};
    if (params.startDate) {
      createdAtFilter.gte = new Date(params.startDate);
    }
    if (params.endDate) {
      createdAtFilter.lte = new Date(params.endDate);
    }
    where.createdAt = createdAtFilter;
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
  opts: { signal?: AbortSignal } = {},
): Promise<PreparedTip> {
  const contractId = config.stellar.contractId;
  if (!contractId) {
    throw new BadRequestError('Contract ID is not configured');
  }

  try {
    await prisma.user.findUniqueOrThrow({ where: { stellarAddress: to } });
  } catch {
    throw new BadRequestError('Recipient not found');
  }

  const sourceAccount = await rpcCall(
    (server) => server.getAccount(from),
    { signal: opts.signal, operationName: 'getAccount' },
  ).catch(() => {
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

  const simulateResponse = await rpcCall(
    (server) => server.simulateTransaction(tx),
    { signal: opts.signal, operationName: 'simulateTransaction' },
  ).catch((err: Error) => {
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
 *
 * Transactional boundary: Tip + Notification + AnalyticsDaily are updated atomically
 * in a single interactive transaction (isolation RepeatableRead, timeout 8000ms).
 * Streak updates are handled via atomic increment/version (see concurrency task).
 * External side-effects (RPC verification, webhook enqueue, realtime publish) are
 * enqueued AFTER commit — never held inside the transaction.
 */
export async function recordTip(input: RecordTipInput): Promise<TipResponseDto> {
  const existing = await prisma.tip.findUnique({ where: { txHash: input.txHash } });
  if (existing) return serializeTip(existing);

  try {
    const { tip, created } = await prisma.$transaction(
      async (tx) => {
        const dup = await tx.tip.findUnique({ where: { txHash: input.txHash } });
        if (dup) return { tip: dup, created: false };

        const tip = await tx.tip.create({
          data: {
            txHash: input.txHash,
            ledger: input.ledger,
            fromAddress: input.fromAddress,
            toAddress: input.toAddress,
            amountStroops: BigInt(input.amountStroops),
            message: input.message,
          },
        });

        // Notification for receiver (if user exists off-chain)
        const receiver = await tx.user.findUnique({
          where: { stellarAddress: input.toAddress },
          select: { id: true },
        });
        if (receiver) {
          await tx.notification.create({
            data: {
              userId: receiver.id,
              type: "tip_received",
              payload: {
                txHash: input.txHash,
                amountStroops: input.amountStroops,
                fromAddress: input.fromAddress,
              } as unknown as Prisma.InputJsonValue,
            },
          });
        }

        // Daily analytics — atomic counters (never read-then-write)
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        await tx.analyticsDaily.upsert({
          where: { date: today },
          create: {
            date: today,
            totalTips: 1,
            totalVolume: BigInt(input.amountStroops),
            newUsers: 0,
            activeUsers: 1,
          },
          update: {
            totalTips: { increment: 1 },
            totalVolume: { increment: BigInt(input.amountStroops) },
          },
        });

        return { tip, created: true };
      },
      {
        timeout: 8000,
        maxWait: 3000,
        isolationLevel: "RepeatableRead",
      },
    );

    // Enqueue side-effects AFTER commit — never inside transaction (connection pool safety)
    if (created) {
      // Goal and Streak are derived counters; use atomic/version helpers after commit
      // Fire-and-forget with error logging, but await for correctness in tests
      try {
        const { atomicIncrementGoalRaised } = await import(
          "../../common/utils/concurrency.js"
        );
        const { updateStreakForTip } = await import("../../common/utils/concurrency.js");
        // Find userIds for atomic updates
        const receiver = await prisma.user.findUnique({
          where: { stellarAddress: input.toAddress },
          select: { id: true },
        });
        const sender = await prisma.user.findUnique({
          where: { stellarAddress: input.fromAddress },
          select: { id: true },
        });
        if (receiver) {
          await atomicIncrementGoalRaised(receiver.id, BigInt(input.amountStroops)).catch((e) =>
            logger.warn({ err: e, userId: receiver.id }, "Goal increment failed"),
          );
        }
        if (sender) {
          await updateStreakForTip(sender.id).catch((e) =>
            logger.warn({ err: e, userId: sender.id }, "Streak update failed"),
          );
        }
      } catch (e) {
        logger.warn({ err: e }, "Post-tip side-effects failed");
      }
    }

    return serializeTip(tip);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const tip = await prisma.tip.findUnique({ where: { txHash: input.txHash } });
      if (tip) return serializeTip(tip);
    }
    throw err;
  }
}

/**
 * PATCH /tips/:txHash/confirm — transition a tip from PENDING to CONFIRMED.
 * Idempotent: calling on an already-CONFIRMED tip is a no-op.
 *
 * Transactional boundary: status transition is wrapped to ensure
 * idempotency under concurrent confirms (isolation ReadCommitted, timeout 5000ms).
 * No external calls are held inside.
 */
export async function confirmTip(txHash: string): Promise<TipResponseDto> {
  return prisma.$transaction(
    async (tx) => {
      const tip = await tx.tip.findUnique({ where: { txHash } });
      if (!tip) throw new NotFoundError("Tip not found");
      if (tip.status === TipStatus.CONFIRMED) return serializeTip(tip);
      const updated = await tx.tip.update({
        where: { txHash },
        data: { status: TipStatus.CONFIRMED },
      });
      return serializeTip(updated);
    },
    {
      timeout: 5000,
      maxWait: 2000,
      isolationLevel: "ReadCommitted",
    },
  );
}

/**
 * GET /tips?aggregate=creator — aggregate tips by recipient address.
 * Returns total amount received and tip count per creator.
 */
export async function aggregateTipsByCreator(): Promise<TipAggregateByCreatorDto[]> {
  const results = await prisma.tip.groupBy({
    by: ['toAddress'],
    where: { status: TipStatus.CONFIRMED },
    _sum: {
      amountStroops: true,
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _sum: {
        amountStroops: 'desc',
      },
    },
  });

  return results.map((row) => ({
    toAddress: row.toAddress,
    totalAmountStroops: row._sum.amountStroops?.toString() ?? '0',
    tipCount: row._count._all,
  }));
}
