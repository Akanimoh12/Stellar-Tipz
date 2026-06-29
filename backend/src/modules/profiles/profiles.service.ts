import type { User } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';
import { BadRequestError, NotFoundError, ConflictError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import type { Profile, ProfileResponse, UpdateProfileRequest, CreateProfileRequest } from './profiles.types.js';

const RESERVED_USERNAMES = new Set(['admin', 'stellar', 'test', 'help', 'api', 'root']);
const PROFILE_CACHE_TTL = 300; // 5 minutes
const PROFILE_CACHE_PREFIX = 'profile:';

function toProfile(user: User): Profile {
  return {
    id: user.id,
    stellarAddress: user.stellarAddress,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    imageUrl: user.imageUrl,
    avatarCid: user.avatarCid,
    xHandle: user.xHandle,
    creditScore: user.creditScore,
    creditTier: user.creditTier,
    minTipAmount: user.minTipAmount ? user.minTipAmount.toString() : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toProfileResponse(profile: Profile): ProfileResponse {
  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function cacheKey(address: string): string {
  return `${PROFILE_CACHE_PREFIX}${address}`;
}

async function getCachedProfile(address: string): Promise<ProfileResponse | null> {
  try {
    const cached = await redis.get(cacheKey(address));
    if (cached) {
      return JSON.parse(cached) as ProfileResponse;
    }
  } catch (err) {
    logger.warn({ err }, 'Redis cache read failed');
  }
  return null;
}

async function setCachedProfile(address: string, profile: ProfileResponse): Promise<void> {
  try {
    await redis.setex(cacheKey(address), PROFILE_CACHE_TTL, JSON.stringify(profile));
  } catch (err) {
    logger.warn({ err }, 'Redis cache write failed');
  }
}

async function invalidateCache(address: string): Promise<void> {
  try {
    await redis.del(cacheKey(address));
  } catch (err) {
    logger.warn({ err }, 'Redis cache invalidation failed');
  }
}

export async function getProfileByAddress(address: string): Promise<ProfileResponse> {
  const cached = await getCachedProfile(address);
  if (cached) {
    return cached;
  }

  const user = await prisma.user.findUnique({ where: { stellarAddress: address } });
  if (!user || user.deletedAt) {
    throw new NotFoundError('Profile not found');
  }

  const profile = toProfileResponse(toProfile(user));
  await setCachedProfile(address, profile);
  return profile;
}

export async function getProfileByUsername(username: string): Promise<ProfileResponse> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.deletedAt) {
    throw new NotFoundError('Profile not found');
  }
  return toProfileResponse(toProfile(user));
}

export async function createProfile(
  userId: string,
  stellarAddress: string,
  data: CreateProfileRequest,
): Promise<ProfileResponse> {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) {
    throw new ConflictError('Profile already exists for this user');
  }

  const usernameTaken = await prisma.user.findUnique({ where: { username: data.username } });
  if (usernameTaken) {
    throw new BadRequestError('Username already taken');
  }

  const user = await prisma.user.create({
    data: {
      id: userId,
      stellarAddress,
      username: data.username,
      displayName: data.displayName ?? null,
      bio: data.bio ?? null,
      imageUrl: data.imageUrl ?? null,
      avatarCid: data.avatarCid ?? null,
      xHandle: data.xHandle ?? null,
    },
  });

  const profile = toProfileResponse(toProfile(user));
  await setCachedProfile(stellarAddress, profile);
  return profile;
}

export async function updateProfile(
  userId: string,
  data: UpdateProfileRequest,
): Promise<ProfileResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError('Profile not found');
  }

  if (data.username && data.username !== user.username) {
    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) {
      throw new BadRequestError('Username already taken');
    }
  }

  const prismaData: Record<string, unknown> = { ...data };
  if (data.minTipAmount !== undefined) {
    prismaData.minTipAmount = BigInt(data.minTipAmount);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: prismaData,
  });

  await invalidateCache(updated.stellarAddress);
  return toProfileResponse(toProfile(updated));
}

export async function reactivateProfile(userId: string): Promise<ProfileResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError('Profile not found');
  }
  if (!user.deletedAt) {
    throw new BadRequestError('Profile is not deactivated');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null },
  });

  await invalidateCache(updated.stellarAddress);
  return toProfileResponse(toProfile(updated));
}

export function validateUsername(username: string): void {
  if (username.length < 3) {
    throw new BadRequestError('Username must be at least 3 characters');
  }
  if (username.length > 32) {
    throw new BadRequestError('Username must be at most 32 characters');
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    throw new BadRequestError('Username can only contain lowercase letters, numbers, and underscores');
  }
  if (RESERVED_USERNAMES.has(username)) {
    throw new BadRequestError(`Username "${username}" is reserved`);
  }
}

export async function checkUsername(username: string): Promise<{ available: boolean }> {
  const existing = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });
  return { available: !existing };
}
