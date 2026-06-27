import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../common/utils/logger.js';
import type { DecodedEvent } from './sorobanClient.js';

/** Event topics that represent an on-chain tip. */
const TIP_TOPICS = new Set(['tip', 'tip_sent']);

/**
 * Project a decoded on-chain event into the off-chain store. Every projection is
 * idempotent: re-running over the same ledgers never produces duplicate rows.
 */
export async function projectEvent(event: DecodedEvent): Promise<void> {
  await persistEventLog(event);
  if (TIP_TOPICS.has(event.topic)) {
    await projectTip(event);
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
