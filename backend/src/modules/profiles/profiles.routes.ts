import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth/auth.middleware.js";
import { deprecatedEndpoint } from "../../common/middleware/deprecation.js";
import { env } from "../../config/env.js";
import {
  listProfilesController,
  getProfileController,
  getProfileByUsernameController,
  getProfileByAddressController,
  updateProfileController,
  deactivateProfileController,
  checkUsernameController,
  reactivateProfileController,
  uploadImageController,
} from "./profiles.controller.js";

const profileUpdateRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
});

/**
 * Profiles module router.
 * Mounted at /api/v1/profiles in app.ts
 */
export const profilesRouter = Router();

/**
 * Public routes
 */
profilesRouter.get("/", listProfilesController);
profilesRouter.get("/check-username", checkUsernameController);
profilesRouter.get("/by-username/:username", getProfileByUsernameController);
profilesRouter.get("/by-address/:address", getProfileByAddressController);
profilesRouter.get(
  "/username/:username",
  deprecatedEndpoint({
    deprecationDate: new Date("2026-08-26T00:00:00.000Z"),
    sunsetDate: new Date("2027-02-28T00:00:00.000Z"),
    documentationUrl: `${env.API_BASE_PATH}/docs`,
    replacement: (req) =>
      `${env.API_BASE_PATH}/profiles/by-username/${encodeURIComponent(req.params.username)}`,
  }),
  getProfileByUsernameController,
);
profilesRouter.get("/address/:address", getProfileByAddressController);
profilesRouter.get("/:id", getProfileController);

/**
 * Protected routes - require authentication
 */
profilesRouter.patch("/me", requireAuth, profileUpdateRateLimit, updateProfileController);
profilesRouter.put("/me", requireAuth, profileUpdateRateLimit, updateProfileController);
profilesRouter.patch("/reactivate", requireAuth, reactivateProfileController);
profilesRouter.post("/image", requireAuth, uploadImageController);
profilesRouter.delete("/me", requireAuth, deactivateProfileController);
