import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import { invalidateCreatorAnalytics } from '../../modules/analytics/analytics.cache.js';
import type { DecodedEvent } from '../sorobanClient.js';
import { toBigInt } from './helpers.js';

/** Event topics that represent an on-chain refund. */
export const REFUND_TOPICS = new Set(['refund', 'tip_refund']);

export interface ParsedRefund {
  tipTxHash: string;
  amount: bigint;
  reason?: string;
}

/**
 * Project a refund event. Wraps refund upsert + tip status update in a single
 * transaction (isolation RepeatableRead, timeout 5000ms) to prevent partial state
 * (refund without tip status). No external network calls are held inside.
 */
export async function projectRefund(event: DecodedEvent): Promise<void> {
  const refund = parseRefund(event.value);
  if (!refund) {
    logger.warn({ txHash: event.txHash }, 'Skipping refund event with unparseable payload');
    return;
  }

  const refundedTo = await prisma.$transaction(
    async (tx) => {
      const tip = await tx.tip.findUnique({ where: { txHash: refund.tipTxHash } });
      if (!tip) {
        logger.warn({ tipTxHash: refund.tipTxHash }, 'Refund event references unknown tip, skipping');
        return null;
      }

      await tx.refund.upsert({
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

      await tx.tip.update({
        where: { id: tip.id },
        data: { status: 'REFUNDED' },
      });
      return tip.toAddress;
    },
    {
      timeout: 5000,
      maxWait: 2000,
      isolationLevel: "RepeatableRead",
    },
  );
  if (refundedTo) await invalidateCreatorAnalytics(refundedTo);
}

export function parseRefund(value: unknown): ParsedRefund | null {
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
