import { emitNotificationCreated } from '../../realtime/index.js';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import * as notificationsService from '../../modules/notifications/notifications.service.js';
import { invalidateCreatorAnalytics } from '../../modules/analytics/analytics.cache.js';
import { observeTip } from '../../common/observability/businessMetrics.js';
import type { DecodedEvent } from '../sorobanClient.js';
import { toBigInt } from './helpers.js';

/** Event topics that represent an on-chain tip. */
export const TIP_TOPICS = new Set(['tip', 'tip_sent']);

/** Upsert the Tip row. txHash is unique, so replays are no-ops. */
export async function projectTip(event: DecodedEvent): Promise<void> {
  const tip = parseTip(event.value);
  if (!tip) {
    logger.warn({ txHash: event.txHash }, 'Skipping tip event with unparseable payload');
    observeTip('indexer', 'unparseable');
    return;
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const existing = await tx.tip.findUnique({ where: { txHash: event.txHash } });
    if (existing) return { created: false, notification: null };
    await tx.tip.create({ data: {
      txHash: event.txHash, ledger: event.ledger, fromAddress: tip.from,
      toAddress: tip.to, amountStroops: tip.amount, message: tip.message ?? null, status: 'CONFIRMED',
    } });
    const receiver = await tx.user.findUnique({ where: { stellarAddress: tip.to }, select: { id: true } });
    const notification = receiver ? await notificationsService.persistNotification(tx, receiver.id, 'tip_received', {
      txHash: event.txHash, amountStroops: tip.amount.toString(), fromAddress: tip.from,
    }) : null;
    return { created: true, notification };
  }).catch((err: unknown) => {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      return { created: false, notification: null };
    }
    observeTip('indexer', 'system_error');
    throw err;
  });
  observeTip('indexer', outcome.created ? 'success' : 'duplicate', outcome.created ? tip.amount : undefined);
  if (outcome.created) await invalidateCreatorAnalytics(tip.to);
  if (outcome.notification) {
    emitNotificationCreated({ ...outcome.notification, createdAt: outcome.notification.createdAt.toISOString() });
  }
}

export interface ParsedTip {
  from: string;
  to: string;
  amount: bigint;
  message?: string;
}

/**
 * Extract tip fields from a decoded event value, accepting either a struct
 * (`{ from, to, amount, message }`) or a positional tuple (`[from, to, amount, message]`).
 */
export function parseTip(value: unknown): ParsedTip | null {
  let from: unknown;
  let to: unknown;
  let amount: unknown;
  let message: unknown;

  if (Array.isArray(value)) {
    [from, to, amount, message] = value[0] === 1 || value[0] === '1' ? value.slice(1) : value;
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
