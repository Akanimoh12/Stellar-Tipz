import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../common/utils/logger.js';
import type { DecodedEvent } from './sorobanClient.js';

/** Event topics that represent an on-chain tip. */
const TIP_TOPICS = new Set(['tip', 'tip_sent']);

/** Event topics that represent an on-chain refund. */
const REFUND_TOPICS = new Set(['refund', 'tip_refund']);

/**
 * Per-topic projection handlers. Each handler is idempotent: re-running it over
 * the same event never produces a duplicate row. Topics are the canonical
 * `_`-joined names decoded from the contract's topic tuples (see `decodeTopic`).
 */
const PROJECTIONS: Record<string, (event: DecodedEvent) => Promise<void>> = {
  profile_register: projectProfileRegistered,
  profile_updated: projectProfileUpdated,
  goal_set: projectGoalSet,
  goal_reached: projectGoalReached,
  goal_cancel: projectGoalCancelled,
  sub_created: projectSubscriptionCreated,
  sub_exec: projectSubscriptionCharged,
  sub_cancel: projectSubscriptionCancelled,
};

/**
 * Project a decoded on-chain event into the off-chain store. Every projection is
 * idempotent: re-running over the same ledgers never produces duplicate rows.
 */
export async function projectEvent(event: DecodedEvent): Promise<void> {
  await persistEventLog(event);

  if (TIP_TOPICS.has(event.topic)) {
    await projectTip(event);
    return;
  }

  const handler = PROJECTIONS[event.topic];
  if (handler) {
    await handler(event);
  }
  if (REFUND_TOPICS.has(event.topic)) {
    await projectRefund(event);
  }
}

/** Store the raw decoded event for audit/replay, skipping if already stored. */
async function persistEventLog(event: DecodedEvent): Promise<void> {
  const existing = await prisma.eventLog.findFirst({
    where: { txHash: event.txHash, topic: event.topic, ledger: event.ledger },
    select: { id: true },
  });
  if (existing) return;

  await prisma.eventLog.create({
    data: {
      topic: event.topic,
      ledger: event.ledger,
      txHash: event.txHash,
      data: (event.value ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/** Upsert the Tip row. txHash is unique, so replays are no-ops. */
async function projectTip(event: DecodedEvent): Promise<void> {
  const tip = parseTip(event.value);
  if (!tip) {
    logger.warn({ txHash: event.txHash }, 'Skipping tip event with unparseable payload');
    return;
  }

  await prisma.tip.upsert({
    where: { txHash: event.txHash },
    create: {
      txHash: event.txHash,
      ledger: event.ledger,
      fromAddress: tip.from,
      toAddress: tip.to,
      amountStroops: tip.amount,
      message: tip.message ?? null,
    },
    update: {},
  });
}

interface ParsedTip {
  from: string;
  to: string;
  amount: bigint;
  message?: string;
}

interface ParsedRefund {
  tipTxHash: string;
  amount: bigint;
  reason?: string;
}

async function projectRefund(event: DecodedEvent): Promise<void> {
  const refund = parseRefund(event.value);
  if (!refund) {
    logger.warn({ txHash: event.txHash }, 'Skipping refund event with unparseable payload');
    return;
  }

  const tip = await prisma.tip.findUnique({ where: { txHash: refund.tipTxHash } });
  if (!tip) {
    logger.warn({ tipTxHash: refund.tipTxHash }, 'Refund event references unknown tip, skipping');
    return;
  }

  await prisma.refund.upsert({
    where: { tipId: tip.id },
    create: {
      tipId: tip.id,
      amount: refund.amount,
      reason: refund.reason ?? '',
      txHash: event.txHash,
      status: 'completed',
    },
    update: {
      amount: refund.amount,
      reason: refund.reason ?? '',
      txHash: event.txHash,
      status: 'completed',
    },
  });

  await prisma.tip.update({
    where: { id: tip.id },
    data: { status: 'REFUNDED' },
  });
}

/**
 * Extract tip fields from a decoded event value, accepting either a struct
 * (`{ from, to, amount, message }`) or a positional tuple (`[from, to, amount, message]`).
 */
function parseTip(value: unknown): ParsedTip | null {
  let from: unknown;
  let to: unknown;
  let amount: unknown;
  let message: unknown;

  if (Array.isArray(value)) {
    [from, to, amount, message] = value;
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    ({ from, to, amount, message } = obj);
  } else {
    return null;
  }

  if (typeof from !== 'string' || typeof to !== 'string') return null;

  const amountStroops = toBigInt(amount);
  if (amountStroops === null) return null;

  return {
    from,
    to,
    amount: amountStroops,
    message: typeof message === 'string' ? message : undefined,
  };
}

function parseRefund(value: unknown): ParsedRefund | null {
  let tipTxHash: unknown;
  let amount: unknown;
  let reason: unknown;

  if (Array.isArray(value)) {
    [tipTxHash, amount, reason] = value;
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    ({ tipTxHash, amount, reason } = obj);
  } else {
    return null;
  }

  if (typeof tipTxHash !== 'string') return null;

  const refundAmount = toBigInt(amount);
  if (refundAmount === null) return null;

  return {
    tipTxHash,
    amount: refundAmount,
    reason: typeof reason === 'string' ? reason : undefined,
  };
}

function toBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
    if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  } catch {
    /* fall through */
  }
  return null;
}

// ── Profile projections (issues #895, #896) ───────────────────────────────────

/**
 * Project a `("profile", "register")` event — data `(owner, username)` — into the
 * User table. Upsert on the unique `stellarAddress`, so replays are no-ops.
 */
async function projectProfileRegistered(event: DecodedEvent): Promise<void> {
  const [owner, username] = tupleArgs(event.value);
  if (typeof owner !== 'string') {
    return warnUnparseable(event, 'profile_register');
  }
  const name = typeof username === 'string' && username.length > 0 ? username : null;

  await prisma.user.upsert({
    where: { stellarAddress: owner },
    create: { stellarAddress: owner, username: name },
    update: name === null ? {} : { username: name },
  });
}

/**
 * Project a `("profile", "updated")` event — data `(owner,)`. The event carries
 * only the owner address (the mutated fields live in contract storage), so the
 * projection just ensures the off-chain User row exists for that address.
 */
async function projectProfileUpdated(event: DecodedEvent): Promise<void> {
  const owner = addressArg(event.value);
  if (owner === null) {
    return warnUnparseable(event, 'profile_updated');
  }
  await ensureUserId(owner);
}

// ── Goal projections (issue #899) ─────────────────────────────────────────────

/**
 * Project a `("goal", "set")` event — data `(creator, target, description,
 * deadline)`. A creator has at most one on-chain goal, so the off-chain row is
 * keyed deterministically per user (`goal_<userId>`); replays upsert the same row.
 */
async function projectGoalSet(event: DecodedEvent): Promise<void> {
  const [creator, target, description, deadline] = tupleArgs(event.value);
  const targetStroops = toBigInt(target);
  if (typeof creator !== 'string' || targetStroops === null) {
    return warnUnparseable(event, 'goal_set');
  }

  const userId = await ensureUserId(creator);
  const title = typeof description === 'string' ? description : '';
  const deadlineAt = toTimestamp(deadline);

  await prisma.goal.upsert({
    where: { id: goalId(userId) },
    create: {
      id: goalId(userId),
      userId,
      title,
      targetStroops,
      raisedStroops: 0n,
      deadline: deadlineAt,
      status: 'ACTIVE',
    },
    update: { title, targetStroops, deadline: deadlineAt, status: 'ACTIVE' },
  });
}

/**
 * Project a `("goal", "reached")` event — data `(creator, target, raised)`.
 * `raised` is the absolute amount, so the update is idempotent on replay.
 */
async function projectGoalReached(event: DecodedEvent): Promise<void> {
  const [creator, target, raised] = tupleArgs(event.value);
  const targetStroops = toBigInt(target);
  const raisedStroops = toBigInt(raised);
  if (typeof creator !== 'string' || targetStroops === null || raisedStroops === null) {
    return warnUnparseable(event, 'goal_reached');
  }

  const userId = await ensureUserId(creator);

  await prisma.goal.upsert({
    where: { id: goalId(userId) },
    create: {
      id: goalId(userId),
      userId,
      title: '',
      targetStroops,
      raisedStroops,
      status: 'COMPLETED',
    },
    update: { targetStroops, raisedStroops, status: 'COMPLETED' },
  });
}

/** Project a `("goal", "cancel")` event — data `(creator,)`. */
async function projectGoalCancelled(event: DecodedEvent): Promise<void> {
  const creator = addressArg(event.value);
  if (creator === null) {
    return warnUnparseable(event, 'goal_cancel');
  }
  const userId = await ensureUserId(creator);
  // updateMany is a no-op (not an error) when the creator has no goal row yet.
  await prisma.goal.updateMany({ where: { id: goalId(userId) }, data: { status: 'CANCELLED' } });
}

// ── Subscription projections (issue #900) ─────────────────────────────────────

/**
 * Project a `("sub", "created")` event — data `(subscriber, creator, amount,
 * interval_days)`. One subscription per (tipper, creator) pair, keyed
 * deterministically (`sub_<tipperId>_<creatorId>`) so replays upsert one row.
 */
async function projectSubscriptionCreated(event: DecodedEvent): Promise<void> {
  const [subscriber, creator, amount, intervalDays] = tupleArgs(event.value);
  const amountStroops = toBigInt(amount);
  if (typeof subscriber !== 'string' || typeof creator !== 'string' || amountStroops === null) {
    return warnUnparseable(event, 'sub_created');
  }

  const tipperId = await ensureUserId(subscriber);
  const creatorId = await ensureUserId(creator);
  const days = toIntervalDays(intervalDays);

  await prisma.subscription.upsert({
    where: { id: subscriptionId(tipperId, creatorId) },
    create: {
      id: subscriptionId(tipperId, creatorId),
      tipperId,
      creatorId,
      amountStroops,
      interval: intervalFromDays(days),
      nextChargeAt: addDays(new Date(), days),
      status: 'ACTIVE',
    },
    update: { amountStroops, interval: intervalFromDays(days), status: 'ACTIVE' },
  });
}

/**
 * Project a `("sub", "exec")` event — data `(subscriber, creator, amount)`. This
 * confirms a successful recurring charge; the subscription is ensured ACTIVE and
 * its charged amount recorded. Per-charge history is out of scope (no table).
 */
async function projectSubscriptionCharged(event: DecodedEvent): Promise<void> {
  const [subscriber, creator, amount] = tupleArgs(event.value);
  const amountStroops = toBigInt(amount);
  if (typeof subscriber !== 'string' || typeof creator !== 'string' || amountStroops === null) {
    return warnUnparseable(event, 'sub_exec');
  }

  const tipperId = await ensureUserId(subscriber);
  const creatorId = await ensureUserId(creator);

  await prisma.subscription.upsert({
    where: { id: subscriptionId(tipperId, creatorId) },
    create: {
      id: subscriptionId(tipperId, creatorId),
      tipperId,
      creatorId,
      amountStroops,
      interval: 'MONTHLY',
      nextChargeAt: addDays(new Date(), 30),
      status: 'ACTIVE',
    },
    update: { amountStroops, status: 'ACTIVE' },
  });
}

/** Project a `("sub", "cancel")` event — data `(subscriber, creator)`. */
async function projectSubscriptionCancelled(event: DecodedEvent): Promise<void> {
  const [subscriber, creator] = tupleArgs(event.value);
  if (typeof subscriber !== 'string' || typeof creator !== 'string') {
    return warnUnparseable(event, 'sub_cancel');
  }
  const tipperId = await ensureUserId(subscriber);
  const creatorId = await ensureUserId(creator);
  await prisma.subscription.updateMany({
    where: { id: subscriptionId(tipperId, creatorId) },
    data: { status: 'CANCELLED' },
  });
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Deterministic off-chain identifier for a creator's single goal. */
function goalId(userId: string): string {
  return `goal_${userId}`;
}

/** Deterministic off-chain identifier for a (tipper, creator) subscription. */
function subscriptionId(tipperId: string, creatorId: string): string {
  return `sub_${tipperId}_${creatorId}`;
}

/**
 * Resolve a Stellar address to a User id, creating a minimal User row if none
 * exists yet. Idempotent: the upsert keys on the unique `stellarAddress`.
 */
async function ensureUserId(address: string): Promise<string> {
  const user = await prisma.user.upsert({
    where: { stellarAddress: address },
    create: { stellarAddress: address },
    update: {},
    select: { id: true },
  });
  return user.id;
}

/** Normalise an event value into its positional argument tuple. */
function tupleArgs(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Extract a single address argument, accepting either a bare value (single-field
 * events publish the address directly) or a one-element tuple.
 */
function addressArg(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

/** Convert an on-chain unix-seconds timestamp to a Date, treating 0/invalid as none. */
function toTimestamp(value: unknown): Date | null {
  const seconds = toBigInt(value);
  if (seconds === null || seconds === 0n) return null;
  return new Date(Number(seconds) * 1000);
}

/** Coerce an on-chain `interval_days` value to a positive integer day count. */
function toIntervalDays(value: unknown): number {
  const days = toBigInt(value);
  return days !== null && days > 0n ? Number(days) : 30;
}

/** Map a day interval onto the closest supported SubscriptionInterval. */
function intervalFromDays(days: number): 'DAILY' | 'WEEKLY' | 'MONTHLY' {
  if (days <= 1) return 'DAILY';
  if (days <= 7) return 'WEEKLY';
  return 'MONTHLY';
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

function warnUnparseable(event: DecodedEvent, topic: string): void {
  logger.warn({ txHash: event.txHash, topic }, 'Skipping event with unparseable payload');
}
