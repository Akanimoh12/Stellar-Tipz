import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../common/errors/AppError.js";
import type {
  UpdateProfileRequest,
} from "./profiles.types.js";
import type { ProfileResponseDto, PaginatedProfilesDto } from "./profiles.dto.js";
import { serializeProfile } from "./profiles.serializer.js";

/**
 * Helper to fetch aggregate tip stats for a user.
 */
async function getTipStats(userId: string): Promise<{ tipsCount: number; totalReceived: string }> {
  const tipsCount = await prisma.tip.count({
    where: {
      receiver: { id: userId },
      status: "CONFIRMED",
    },
  });

  const aggregate = await prisma.tip.aggregate({
    where: {
      receiver: { id: userId },
      status: "CONFIRMED",
    },
    _sum: {
      amountStroops: true,
    },
  });

  const totalReceived = aggregate._sum.amountStroops?.toString() || "0";

  return {
    tipsCount,
    totalReceived,
  };
}

/**
 * Gets a profile by user ID.
 */
export async function getProfileById(userId: string): Promise<ProfileResponseDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      stellarAddress: true,
      username: true,
      displayName: true,
      bio: true,
      imageUrl: true,
      avatarCid: true,
      xHandle: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user || user.deletedAt !== null) {
    throw new NotFoundError("Profile not found");
  }

  const stats = await getTipStats(user.id);
  return serializeProfile(user, stats);
}

/**
 * Gets a profile by username.
 */
export async function getProfileByUsername(
  username: string,
): Promise<ProfileResponseDto> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      stellarAddress: true,
      username: true,
      displayName: true,
      bio: true,
      imageUrl: true,
      avatarCid: true,
      xHandle: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user || user.deletedAt !== null) {
    throw new NotFoundError("Profile not found");
  }

  const stats = await getTipStats(user.id);
  return serializeProfile(user, stats);
}

/**
 * Gets a profile by Stellar address.
 */
export async function getProfileByAddress(
  stellarAddress: string,
): Promise<ProfileResponseDto> {
  const user = await prisma.user.findUnique({
    where: { stellarAddress },
    select: {
      id: true,
      stellarAddress: true,
      username: true,
      displayName: true,
      bio: true,
      imageUrl: true,
      avatarCid: true,
      xHandle: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user || user.deletedAt !== null) {
    throw new NotFoundError("Profile not found");
  }

  const stats = await getTipStats(user.id);
  return serializeProfile(user, stats);
}

/**
 * Updates the authenticated user's profile.
 */
export async function updateProfile(
  userId: string,
  data: UpdateProfileRequest,
): Promise<ProfileResponseDto> {
  // Check if profile exists and is active
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.deletedAt !== null) {
    throw new NotFoundError("Profile not found");
  }

  // Check if username is already taken
  if (data.username) {
    const existingUser = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new ConflictError("Username already taken");
    }
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        stellarAddress: true,
        username: true,
        displayName: true,
        bio: true,
        imageUrl: true,
        avatarCid: true,
        xHandle: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info({ userId }, "Profile updated successfully");
    const stats = await getTipStats(updatedUser.id);
    return serializeProfile(updatedUser, stats);
  } catch (error) {
    logger.error({ userId, error }, "Failed to update profile");
    throw new BadRequestError("Failed to update profile");
  }
}

/**
 * Lists all profiles with pagination.
 */
export async function listProfiles(
  page = 1,
  limit = 20,
): Promise<PaginatedProfilesDto> {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      skip,
      take: limit,
      select: {
        id: true,
        stellarAddress: true,
        username: true,
        displayName: true,
        bio: true,
        imageUrl: true,
        avatarCid: true,
        xHandle: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({
      where: { deletedAt: null },
    }),
  ]);

  const profiles = await Promise.all(
    users.map(async (user) => {
      const stats = await getTipStats(user.id);
      return serializeProfile(user, stats);
    })
  );

  return {
    profiles,
    total,
    page,
    limit,
  };
}

/**
 * Deactivates (soft-deletes) the authenticated user's profile.
 */
export async function deactivateProfile(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.deletedAt !== null) {
    throw new NotFoundError("Profile not found");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  });

  logger.info({ userId }, "Profile deactivated successfully");
}
