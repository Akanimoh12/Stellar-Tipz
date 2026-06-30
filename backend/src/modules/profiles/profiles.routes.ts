import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  listProfilesController,
  getProfileController,
  getProfileByUsernameController,
  getProfileByAddressController,
  updateProfileController,
  deactivateProfileController,
} from "./profiles.controller.js";

/**
 * Profiles module router.
 * Mounted at /api/v1/profiles in app.ts
 */
export const profilesRouter = Router();

/**
 * Public routes
 */
profilesRouter.get("/", listProfilesController);
profilesRouter.get("/:id", getProfileController);
profilesRouter.get("/username/:username", getProfileByUsernameController);
profilesRouter.get("/address/:address", getProfileByAddressController);

/**
 * Protected routes - require authentication
 */
profilesRouter.patch("/me", requireAuth, updateProfileController);
profilesRouter.put("/me", requireAuth, updateProfileController);
profilesRouter.delete("/me", requireAuth, deactivateProfileController);
