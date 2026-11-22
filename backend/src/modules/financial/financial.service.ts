import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { NotFoundError } from "../../common/errors/AppError.js";
import type { WithdrawalFeePreview, RefundCheck } from "./financial.types.js";

const REFUND_REQUEST_WINDOW_SECS = 86400; // 24 hours
const REFUND_RESPONSE_WINDOW_SECS = 172800; // 48 hours
const REFUND_NON_REFUNDABLE_FEE_BPS = 200; // 2%

/**
 * Calculates withdrawal fee and net amount.
 * Returns the fee breakdown for a withdrawal amount.
 */
export function calculateWithdrawalFee(
  amountStroops: bigint,
  feeBps: number,
): WithdrawalFeePreview {
  const feeStroops = (amountStroops * BigInt(feeBps)) / BigInt(10000);
  const netAmountStroops = amountStroops - feeStroops;

  return {
    amountStroops,
    feeBps,
    feeStroops,
    netAmountStroops,
  };
}

/**
 * Gets a withdrawal fee preview endpoint that shows what the user will receive.
 * Issues #1651
 */
export async function getWithdrawalFeePreview(
  userId: string,
  amountStroops: bigint,
): Promise<WithdrawalFeePreview> {
  logger.info({ userId, amountStroops: amountStroops.toString() }, "Calculating withdrawal fee preview");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError(`User ${userId} not found`);

  // Note: feeBps would be fetched from the contract configuration in a real implementation
  // For now, we use a default
  const feeBps = 100; // 1% default fee

  const preview = calculateWithdrawalFee(amountStroops, feeBps);
  logger.info(
    { userId, amountStroops: amountStroops.toString(), feeStroops: preview.feeStroops.toString() },
    "Withdrawal fee preview calculated"
  );

  return preview;
}

/**
 * Checks if a tip can be refunded based on the refund window.
 * Aligns with the contract's refund window logic.
 * Issues #1652
 */
export async function checkRefundEligibility(
  tipId: string,
): Promise<RefundCheck> {
  logger.info({ tipId }, "Checking refund eligibility");

  const tip = await prisma.tip.findUnique({ where: { id: tipId } });
  if (!tip) {
    throw new NotFoundError(`Tip ${tipId} not found`);
  }

  const now = Math.floor(Date.now() / 1000);
  const tipCreatedAtSecs = Math.floor(tip.createdAt.getTime() / 1000);
  const secondsSinceTip = now - tipCreatedAtSecs;

  // Check if within request window (24 hours)
  if (secondsSinceTip > REFUND_REQUEST_WINDOW_SECS) {
    return {
      tipId,
      canRefund: false,
      reason: "Refund request window has expired (24 hours)",
      requestWindowSecsRemaining: 0,
    };
  }

  // Check if already refunded
  const existingRefund = await prisma.refund.findUnique({
    where: { tipId },
  });

  if (existingRefund) {
    return {
      tipId,
      canRefund: false,
      reason: "Refund already processed for this tip",
    };
  }

  const requestWindowSecsRemaining = REFUND_REQUEST_WINDOW_SECS - secondsSinceTip;

  return {
    tipId,
    canRefund: true,
    requestWindowSecsRemaining,
    responseWindowSecsRemaining: REFUND_RESPONSE_WINDOW_SECS,
  };
}

/**
 * Calculates refund amounts considering non-refundable fees.
 * Used to align API refund calculations with contract logic.
 */
export function calculateRefundAmount(
  originalAmountStroops: bigint,
): { refundAmount: bigint; nonRefundableFee: bigint } {
  const nonRefundableFee =
    (originalAmountStroops * BigInt(REFUND_NON_REFUNDABLE_FEE_BPS)) / BigInt(10000);
  const refundAmount = originalAmountStroops - nonRefundableFee;

  return { refundAmount, nonRefundableFee };
}
