/**
 * Express router for X integration endpoints (issues #1294, #1293).
 */

import { Router } from "express";
import { authMiddleware } from "../auth/auth.middleware.js";
import {
  linkXAccountController,
  unlinkXAccountController,
  getXMetricsController,
  verifyProofController,
  getQuotaStatusController,
} from "./x.controller.js";

export const xRouter = Router();

/**
 * POST /api/v1/x/link
 * Link authenticated user's X account with proof of ownership.
 * Required scopes: "x:link"
 */
xRouter.post("/link", authMiddleware, linkXAccountController);

/**
 * DELETE /api/v1/x/link
 * Unlink authenticated user's X account.
 * Triggers credit score recomputation.
 */
xRouter.delete("/link", authMiddleware, unlinkXAccountController);

/**
 * GET /api/v1/x/metrics/:handle
 * Public endpoint: Get X metrics (followers, engagement) for a handle.
 * Uses fallback to cached data if API quota exhausted.
 */
xRouter.get("/metrics/:handle", getXMetricsController);

/**
 * POST /api/v1/x/verify-proof
 * Public endpoint: Verify ownership proof (for testing/frontend).
 */
xRouter.post("/verify-proof", verifyProofController);

/**
 * GET /api/v1/x/quota-status
 * Admin endpoint: Get current X API quota status and exhaustion flag.
 */
xRouter.get("/quota-status", authMiddleware, getQuotaStatusController);
