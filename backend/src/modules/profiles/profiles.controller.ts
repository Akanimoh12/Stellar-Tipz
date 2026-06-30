import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BadRequestError } from "../../common/errors/AppError.js";
import {
  getProfileById,
  getProfileByUsername,
  getProfileByAddress,
  updateProfile,
  listProfiles,
  deactivateProfile,
} from "./profiles.service.js";
import {
  updateProfileSchema,
  profileIdSchema,
  usernameSchema,
} from "./profiles.schema.js";
import type { AuthPayload } from "../auth/auth.types.js";

/**
 * GET /profiles
 * Lists all profiles with pagination.
 */
export async function listProfilesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (page < 1 || limit < 1 || limit > 100) {
      throw new BadRequestError("Invalid pagination parameters");
    }

    const result = await listProfiles(page, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /profiles/:id
 * Gets a profile by user ID.
 */
export async function getProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = profileIdSchema.parse(req.params);
    const profile = await getProfileById(id);
    res.json(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid profile ID", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * GET /profiles/username/:username
 * Gets a profile by username.
 */
export async function getProfileByUsernameController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { username } = usernameSchema.parse(req.params);
    const profile = await getProfileByUsername(username);
    res.json(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid username", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * GET /profiles/address/:address
 * Gets a profile by Stellar address.
 */
export async function getProfileByAddressController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const address = req.params.address;
    if (!address) {
      throw new BadRequestError("Stellar address is required");
    }
    const profile = await getProfileByAddress(address);
    res.json(profile);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH/PUT /profiles/me
 * Updates the authenticated user's profile.
 */
export async function updateProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    const data = updateProfileSchema.parse(req.body);
    const profile = await updateProfile(auth.userId, data);
    res.json(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid profile data", error.issues));
    } else {
      next(error);
    }
  }
}

/**
 * DELETE /profiles/me
 * Deactivates (soft-deletes) the authenticated user's profile.
 */
export async function deactivateProfileController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = req.auth as AuthPayload;
    await deactivateProfile(auth.userId);
    res.json({ success: true, message: "Profile deactivated successfully" });
  } catch (error) {
    next(error);
  }
}
