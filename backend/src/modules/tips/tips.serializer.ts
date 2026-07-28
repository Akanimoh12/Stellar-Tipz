import type { Tip } from '@prisma/client';
import type { TipResponseDto } from './tips.dto.js';

export function serializeTip(tip: Tip): TipResponseDto {
  return {
    id: tip.id,
    txHash: tip.txHash,
    ledger: tip.ledger,
    fromAddress: tip.fromAddress,
    toAddress: tip.toAddress,
    amountStroops: tip.amountStroops.toString(),
    status: tip.status,
    message: tip.message,
    createdAt: tip.createdAt.toISOString(),
  };
}
