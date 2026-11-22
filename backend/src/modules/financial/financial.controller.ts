import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BadRequestError } from "../../common/errors/AppError.js";
import {
  getWithdrawalFeePreview,
  checkRefundEligibility,
} from "./financial.service.js";

const withdrawalFeeSchema = z.object({
  amountStroops: z.string().regex(/^\d+$/, "amountStroops must be a valid number string"),
});

const refundCheckSchema = z.object({
  tipId: z.string().cuid("tipId must be a valid CUID"),
});

/**
 * GET /financial/withdrawal-fee-preview
 * Returns fee and net amount for a withdrawal.
 * Issue #1651
 */
export async function getWithdrawalFeePreviewController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { amountStroops } = withdrawalFeeSchema.parse(req.query);
    const userId = req.user?.id;

    if (!userId) {
      next(new BadRequestError("User not authenticated"));
      return;
    }

    const preview = await getWithdrawalFeePreview(userId, BigInt(amountStroops));
    res.json({
      data: {
        amountStroops: preview.amountStroops.toString(),
        feeBps: preview.feeBps,
        feeStroops: preview.feeStroops.toString(),
        netAmountStroops: preview.netAmountStroops.toString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid parameters", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * GET /financial/refund-check/:tipId
 * Checks if a tip is eligible for refund based on window constraints.
 * Issue #1652
 */
export async function checkRefundEligibilityController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { tipId } = refundCheckSchema.parse(req.params);
    const refundCheck = await checkRefundEligibility(tipId);
    res.json({ data: refundCheck });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid tip ID", error.issues));
    } else {
      next(error);
    }
  }
}
