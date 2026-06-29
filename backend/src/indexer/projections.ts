import { prisma } from '../db/prisma.js';
import { logger } from '../common/utils/logger.js';
import type { DecodedEvent } from './sorobanClient.js';

/** Event topics that represent an on-chain tip. */
const TIP_TOPICS = new Set(['tip', 'tip_sent']);

/** Event topics that represent an on-chain refund. */
const REFUND_TOPICS = new Set(['refund', 'tip_refund']);

/**
 * Project a decoded on-chain event into the off-chain store. Every projection is
 * idempotent: re-running over the same ledgers never produces duplicate rows.
 */
export async function projectEvent(event: DecodedEvent): Promise<void> {
  await persistEventLog(event);
  if (TIP_TOPICS.has(event.topic)) {
    await projectTip(event);
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
      data: event.value as Record<string, unknown>,
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