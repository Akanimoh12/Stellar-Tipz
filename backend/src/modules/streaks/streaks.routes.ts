import { Router } from "express";
import { getStreakController, getStreakByAddressController } from "./streaks.controller.js";

const router = Router();

/**
 * Streak routes
 *
 * Issue #1270
 */
router.get("/:userId", getStreakController);
router.get("/address/:stellarAddress", getStreakByAddressController);

export default router;
