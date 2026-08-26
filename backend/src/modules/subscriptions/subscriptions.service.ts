import { Contract, TransactionBuilder, SorobanRpc, nativeToScVal, Networks, Keypair } from '@stellar/stellar-sdk';
import { config } from '../../config/index.js';
import { prisma } from '../../db/prisma.js';
import type { Prisma } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import type {
  SubscriptionResponse,
  PreparedSubscriptionTx,
  SubmittedSubscriptionCreate,
  SubmittedSubscriptionCancel,
  SubscriptionIntervalName,
} from './subscriptions.types.js';
import {
  createCursorScope,
  descendingCursorCondition,
  toCursorPage,
} from '../../common/pagination/cursor.js';

/** Maps the API's interval name onto the raw day count the contract expects. */
export const INTERVAL_DAYS: Record<SubscriptionIntervalName, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
};

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Deterministic off-chain identifier for a (tipper, creator) subscription —
 * must match the indexer's own `subscriptionId()` in `indexer/projections.ts`
 * so an optimistic write here and the indexer's later projection of the same
 * on-chain event upsert the same row instead of creating a duplicate.
 */
function subscriptionId(tipperId: string, creatorId: string): string {
  return `sub_${tipperId}_${creatorId}`;
}

function serializeSubscription(sub: {
  id: string;
  tipperId: string;
  creatorId: string;
  amountStroops: bigint;
  interval: string;
  nextChargeAt: Date;
  status: string;
  createdAt: Date;
  tipper: { stellarAddress: string };
  creator: { stellarAddress: string };
}): SubscriptionResponse {
  return {
    id: sub.id,
    tipperId: sub.tipperId,
    tipperStellarAddress: sub.tipper.stellarAddress,
    creatorId: sub.creatorId,
    creatorStellarAddress: sub.creator.stellarAddress,
    amountStroops: sub.amountStroops.toString(),
    interval: sub.interval as SubscriptionResponse['interval'],
    nextChargeAt: sub.nextChargeAt.toISOString(),
    status: sub.status as SubscriptionResponse['status'],
    createdAt: sub.createdAt.toISOString(),
  };
}

/** GET /subscriptions/me — subscriptions where the user is the tipper or the creator. */
export async function listMySubscriptions(
  userId: string,
  role: 'tipper' | 'creator',
  status: SubscriptionResponse['status'] | undefined,
  limit: number,
  cursor?: string,
  offset?: number,
): Promise<{ data: SubscriptionResponse[]; nextCursor: string | null }> {
  const scope = createCursorScope('subscriptions', { userId, role, status });
  const cursorCondition = descendingCursorCondition('createdAt', cursor, scope);
  const baseWhere: Prisma.SubscriptionWhereInput = {
    ...(role === 'tipper' ? { tipperId: userId } : { creatorId: userId }),
    deletedAt: null,
    ...(status ? { status } : {}),
  };
  const where: Prisma.SubscriptionWhereInput = cursorCondition
    ? { AND: [baseWhere, cursorCondition as Prisma.SubscriptionWhereInput] }
    : baseWhere;
  const subscriptions = await prisma.subscription.findMany({
    where,
    include: { tipper: true, creator: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(offset !== undefined ? { skip: offset } : {}),
    take: limit + 1,
  });
  const page = toCursorPage(subscriptions, limit, scope, (subscription) => subscription.createdAt);

  return {
    data: page.data.map(serializeSubscription),
    nextCursor: page.nextCursor,
  };
}

async function loadCreatorByAddress(creatorStellarAddress: string) {
  const creator = await prisma.user.findUnique({ where: { stellarAddress: creatorStellarAddress } });
  if (!creator) throw new BadRequestError('Creator not found');
  return creator;
}

function getServer(): SorobanRpc.Server {
  return new SorobanRpc.Server(config.stellar.rpcUrl, {
    allowHttp: config.stellar.rpcUrl.startsWith('http://'),
  });
}

function getNetworkPassphrase(): string {
  return Networks[config.stellar.network as keyof typeof Networks] ?? config.stellar.networkPassphrase;
}

/**
 * POST /subscriptions/prepare — build an unsigned transaction calling the
 * contract's `create_subscription`, for the tipper to sign with their wallet.
 */
export async function prepareCreateSubscription(
  tipperId: string,
  creatorStellarAddress: string,
  amountStroops: string,
  interval: SubscriptionIntervalName,
): Promise<PreparedSubscriptionTx> {
  const contractId = config.stellar.contractId;
  if (!contractId) throw new BadRequestError('Contract ID is not configured');

  const tipper = await prisma.user.findUnique({ where: { id: tipperId } });
  if (!tipper) throw new BadRequestError('User not found');

  const creator = await loadCreatorByAddress(creatorStellarAddress);
  if (creator.id === tipperId) throw new BadRequestError('Cannot subscribe to yourself');

  const parsedAmount = BigInt(amountStroops);
  if (parsedAmount <= 0) throw new BadRequestError('Amount must be positive');

  const server = getServer();
  const sourceAccount = await server.getAccount(tipper.stellarAddress).catch(() => {
    throw new BadRequestError('Source account not found on network');
  });
  const networkPassphrase = getNetworkPassphrase();

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(sourceAccount, { fee: '100', networkPassphrase })
    .addOperation(
      contract.call(
        'create_subscription',
        nativeToScVal(tipper.stellarAddress, { type: 'address' }),
        nativeToScVal(creatorStellarAddress, { type: 'address' }),
        nativeToScVal(parsedAmount.toString(), { type: 'i128' }),
        nativeToScVal(INTERVAL_DAYS[interval], { type: 'u32' }),
      ),
    )
    .setTimeout(30)
    .build();

  const simulateResponse = await server.simulateTransaction(tx).catch((err: Error) => {
    logger.error({ err }, 'Subscription creation simulation failed');
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

/**
 * POST /subscriptions/submit — broadcast a wallet-signed `create_subscription`
 * transaction and optimistically upsert the subscription row. Safe to race
 * with the indexer's own `sub_created` projection, which upserts the same
 * deterministic id.
 */
export async function submitCreateSubscription(
  tipperId: string,
  creatorStellarAddress: string,
  amountStroops: string,
  interval: SubscriptionIntervalName,
  signedTxXdr: string,
): Promise<SubmittedSubscriptionCreate> {
  const tipper = await prisma.user.findUnique({ where: { id: tipperId } });
  if (!tipper) throw new BadRequestError('User not found');

  const creator = await loadCreatorByAddress(creatorStellarAddress);
  if (creator.id === tipperId) throw new BadRequestError('Cannot subscribe to yourself');

  const parsedAmount = BigInt(amountStroops);
  if (parsedAmount <= 0) throw new BadRequestError('Amount must be positive');

  const networkPassphrase = getNetworkPassphrase();
  const tx = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);

  const server = getServer();
  const sendResponse = await server.sendTransaction(tx).catch((err: Error) => {
    logger.error({ err }, 'Subscription creation submission failed');
    throw new BadRequestError('Failed to submit subscription transaction');
  });

  if (sendResponse.status === 'ERROR') {
    logger.error(
      { hash: sendResponse.hash },
      'Subscription creation transaction rejected by the network',
    );
    throw new BadRequestError('Transaction rejected by the network');
  }

  const id = subscriptionId(tipperId, creator.id);
  const nextChargeAt = addDays(new Date(), INTERVAL_DAYS[interval]);

  const subscription = await prisma.subscription.upsert({
    where: { id },
    create: {
      id,
      tipperId,
      creatorId: creator.id,
      amountStroops: parsedAmount,
      interval,
      nextChargeAt,
      status: 'ACTIVE',
    },
    update: {
      amountStroops: parsedAmount,
      interval,
      status: 'ACTIVE',
      deletedAt: null,
    },
  });

  return {
    id: subscription.id,
    status: subscription.status,
    nextChargeAt: subscription.nextChargeAt.toISOString(),
  };
}

async function loadOwnedActiveSubscription(tipperId: string, creatorStellarAddress: string) {
  const creator = await loadCreatorByAddress(creatorStellarAddress);
  const id = subscriptionId(tipperId, creator.id);
  const subscription = await prisma.subscription.findUnique({ where: { id } });
  if (!subscription || subscription.tipperId !== tipperId || subscription.deletedAt) {
    throw new NotFoundError('Subscription not found');
  }
  if (subscription.status === 'CANCELLED') {
    throw new BadRequestError('Subscription is already cancelled');
  }
  return subscription;
}

/**
 * POST /subscriptions/prepare-cancel — build an unsigned transaction calling
 * the contract's `cancel_subscription`, for the tipper to sign.
 */
export async function prepareCancelSubscription(
  tipperId: string,
  creatorStellarAddress: string,
): Promise<PreparedSubscriptionTx> {
  const contractId = config.stellar.contractId;
  if (!contractId) throw new BadRequestError('Contract ID is not configured');

  const tipper = await prisma.user.findUnique({ where: { id: tipperId } });
  if (!tipper) throw new BadRequestError('User not found');

  await loadOwnedActiveSubscription(tipperId, creatorStellarAddress);

  const server = getServer();
  const sourceAccount = await server.getAccount(tipper.stellarAddress).catch(() => {
    throw new BadRequestError('Source account not found on network');
  });
  const networkPassphrase = getNetworkPassphrase();

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(sourceAccount, { fee: '100', networkPassphrase })
    .addOperation(
      contract.call(
        'cancel_subscription',
        nativeToScVal(tipper.stellarAddress, { type: 'address' }),
        nativeToScVal(creatorStellarAddress, { type: 'address' }),
      ),
    )
    .setTimeout(30)
    .build();

  const simulateResponse = await server.simulateTransaction(tx).catch((err: Error) => {
    logger.error({ err }, 'Subscription cancellation simulation failed');
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

/**
 * POST /subscriptions/submit-cancel — broadcast a wallet-signed
 * `cancel_subscription` transaction and optimistically mark the subscription
 * CANCELLED. Safe to race with the indexer's own `sub_cancel` projection.
 */
export async function submitCancelSubscription(
  tipperId: string,
  creatorStellarAddress: string,
  signedTxXdr: string,
): Promise<SubmittedSubscriptionCancel> {
  const subscription = await loadOwnedActiveSubscription(tipperId, creatorStellarAddress);

  const networkPassphrase = getNetworkPassphrase();
  const tx = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase);

  const server = getServer();
  const sendResponse = await server.sendTransaction(tx).catch((err: Error) => {
    logger.error({ err }, 'Subscription cancellation submission failed');
    throw new BadRequestError('Failed to submit cancellation transaction');
  });

  if (sendResponse.status === 'ERROR') {
    logger.error(
      { hash: sendResponse.hash },
      'Subscription cancellation transaction rejected by the network',
    );
    throw new BadRequestError('Transaction rejected by the network');
  }

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'CANCELLED' },
  });

  return { id: updated.id, status: updated.status };
}

/**
 * Charges a single due subscription by invoking the contract's
 * `execute_due_subscription(subscriber, creator)`. Unlike create/cancel, this
 * contract function does not require the subscriber's signature — it's
 * designed to be called by a keeper — so this signs and submits with the
 * platform's own keeper key (`config.subscriptions.keeperSecretKey`) rather
 * than a wallet-provided XDR. Used by the subscription-charge job (#1029).
 */
export async function chargeSubscriptionOnChain(
  subscriberAddress: string,
  creatorAddress: string,
): Promise<void> {
  const contractId = config.stellar.contractId;
  if (!contractId) throw new Error('Contract ID is not configured');

  const keeperSecretKey = config.subscriptions.keeperSecretKey;
  if (!keeperSecretKey) throw new Error('Subscription keeper secret key is not configured');

  const keeperKeypair = Keypair.fromSecret(keeperSecretKey);
  const server = getServer();
  const networkPassphrase = getNetworkPassphrase();

  const keeperAccount = await server.getAccount(keeperKeypair.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(keeperAccount, { fee: '100', networkPassphrase })
    .addOperation(
      contract.call(
        'execute_due_subscription',
        nativeToScVal(subscriberAddress, { type: 'address' }),
        nativeToScVal(creatorAddress, { type: 'address' }),
      ),
    )
    .setTimeout(30)
    .build();

  const simulateResponse = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simulateResponse)) {
    throw new Error(`Simulation error: ${simulateResponse.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simulateResponse).build();
  prepared.sign(keeperKeypair);

  const sendResponse = await server.sendTransaction(prepared);
  if (sendResponse.status === 'ERROR') {
    throw new Error('Subscription charge transaction rejected by the network');
  }
}
