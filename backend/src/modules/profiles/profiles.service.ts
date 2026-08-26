import { prisma } from "../../db/prisma.js";
import { redis } from "../../db/redis.js";
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
      creditScore: {
        select: { value: true, computedAt: true },
      },
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
      creditScore: {
        select: { value: true, computedAt: true },
      },
    },
  });

  if (!user || user.deletedAt !== null) {
    throw new NotFoundError("Profile not found");
  }

  const stats = await getTipStats(user.id);
  return serializeProfile(user, stats);
}

const CACHE_PREFIX = "profile:";
const CACHE_TTL_SEC = 300;

function cacheKey(address: string): string {
  return `${CACHE_PREFIX}${address}`;
}

/**
 * Gets a profile by Stellar address.
 */
export async function getProfileByAddress(
  stellarAddress: string,
): Promise<ProfileResponseDto> {
  const cached = await redis.get(cacheKey(stellarAddress));
  if (cached) {
    return JSON.parse(cached) as ProfileResponseDto;
  }

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
      creditScore: {
        select: { value: true, computedAt: true },
      },
    },
  });

  if (!user || user.deletedAt !== null) {
    throw new NotFoundError("Profile not found");
  }

  const stats = await getTipStats(user.id);
  const profile = serializeProfile(user, stats);
  await redis.setex(cacheKey(stellarAddress), CACHE_TTL_SEC, JSON.stringify(profile));
  return profile;
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
        creditScore: {
          select: { value: true, computedAt: true },
        },
      },
    });

    await redis.del(cacheKey(user.stellarAddress));

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
 *
 * Uses a single batched `tip.groupBy` to hydrate tip stats for all users on
 * the page, eliminating the O(N) per-user queries that were causing N+1
 * regressions (issue #1243).
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
        creditScore: {
          select: { value: true, computedAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({
      where: { deletedAt: null },
    }),
  ]);

  // Batch-fetch tip stats for all users on this page in a single groupBy query
  // instead of one count + one aggregate per user (N+1 fix, issue #1243).
  const addresses = users.map((u) => u.stellarAddress);
  const tipStats = await prisma.tip.groupBy({
    by: ["toAddress"],
    where: {
      toAddress: { in: addresses },
      status: "CONFIRMED",
    },
    _count: { id: true },
    _sum: { amountStroops: true },
  });

  const statsMap = new Map(
    tipStats.map((s) => [
      s.toAddress,
      {
        tipsCount: s._count.id,
        totalReceived: s._sum.amountStroops?.toString() ?? "0",
      },
    ]),
  );

  const profiles = users.map((user) => {
    const stats = statsMap.get(user.stellarAddress) ?? {
      tipsCount: 0,
      totalReceived: "0",
    };
    return serializeProfile(user, stats);
  });

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

export async function checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  return { available: !user };
}

export async function reactivateProfile(userId: string): Promise<ProfileResponseDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError("Profile not found");
  }

  if (user.deletedAt === null) {
    throw new BadRequestError("Profile is not deactivated");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null },
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
      creditScore: {
        select: { value: true, computedAt: true },
      },
    },
  });

  await redis.del(cacheKey(user.stellarAddress));

  const stats = await getTipStats(updatedUser.id);
  return serializeProfile(updatedUser, stats);
}

export async function uploadProfileImage(
  userId: string,
  dataUrl: string,
): Promise<{ profileImageCid: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.deletedAt !== null) {
    throw new NotFoundError("Profile not found");
  }

  const simulatedCid = "sim-" + Buffer.from(dataUrl).toString("hex").slice(0, 12);

  await prisma.user.update({
    where: { id: userId },
    data: { avatarCid: simulatedCid },
  });

  return { profileImageCid: simulatedCid };
}
