import { Router } from "express";
import {
  getWithdrawalFeePreviewController,
  checkRefundEligibilityController,
} from "./financial.controller.js";

export const financialRouter = Router();

/**
 * GET /financial/withdrawal-fee-preview?amountStroops=X
 * Returns fee and net amount breakdown for a withdrawal.
 * Issue #1651
 */
financialRouter.get("/withdrawal-fee-preview", getWithdrawalFeePreviewController);

/**
 * GET /financial/refund-check/:tipId
 * Checks refund eligibility and returns remaining windows.
 * Issue #1652
 */
financialRouter.get("/refund-check/:tipId", checkRefundEligibilityController);
