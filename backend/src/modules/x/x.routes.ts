import { Router } from "express";
import {
  getXMetricsController,
  getCachedXMetricsController,
} from "./x.controller.js";

/**
 * X integration module router.
 * Mounted at /api/v1/x in app.ts
 */
export const xRouter = Router();

/**
 * Public routes for fetching X account metrics
 */
xRouter.get("/metrics/:handle", getXMetricsController);
xRouter.get("/cached/:handle", getCachedXMetricsController);
