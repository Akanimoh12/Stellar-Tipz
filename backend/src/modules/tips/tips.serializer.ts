import type { Tip } from '@prisma/client';
import type { TipResponseDto, TipReceiptDto } from './tips.dto.js';
import { config } from '../../config/index.js';

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

export function serializeTipReceipt(tip: Tip): TipReceiptDto {
  return {
    txHash: tip.txHash,
    ledger: tip.ledger,
    fromAddress: tip.fromAddress,
    toAddress: tip.toAddress,
    amountStroops: tip.amountStroops.toString(),
    feeStroops: tip.networkFee.toString(),
    tokenCode: tip.tokenCode,
    status: tip.status,
    message: tip.message,
    createdAt: tip.createdAt.toISOString(),
    explorerUrl: `${config.stellar.explorerBaseUrl}/tx/${tip.txHash}`,
  };
}
