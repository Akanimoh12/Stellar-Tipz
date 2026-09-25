import { Router } from "express";
import { searchController } from "./search.controller.js";

const router = Router();

/**
 * Search routes
 *
 * Issue #1266
 */
router.get("/", searchController);

export default router;
