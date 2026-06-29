import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../common/errors/AppError.js';
import { reservedUsernames, usernameSchema } from './profiles.schema.js';
import { config } from '../../config/index.js';
import type { UpdateProfileInput } from './profiles.schema.js';

export interface ProfileResult {
  id: string;
  stellarAddress: string;
  username: string | null;
  profileImageCid: string | null;
  createdAt: Date;
}

function toProfile(user: {
  id: string;
  stellarAddress: string;
  username: string | null;
  profileImageCid: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}): ProfileResult | null {
  if (user.deletedAt) return null;
  return {
    id: user.id,
    stellarAddress: user.stellarAddress,
    username: user.username,
    profileImageCid: user.profileImageCid,
    createdAt: user.createdAt,
  };
}

/**
 * Validates a username against the schema rules and reserved-username list.
 * Throws a BadRequestError with a human-readable message on failure.
 */
export function validateUsername(username: string): void {
  const result = usernameSchema.safeParse(username);
  if (!result.success) {
    throw new BadRequestError(result.error.errors[0].message);
  }
  if ((reservedUsernames as readonly string[]).includes(username.toLowerCase())) {
    throw new BadRequestError(`Username "${username}" is reserved`);
  }
}

export async function checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
  const user = await prisma.user.findFirst({
    where: {
      username: { equals: username, mode: 'insensitive' },
      deletedAt: null,
    },
  });
  return { available: !user };
}

export async function getProfileByAddress(address: string): Promise<ProfileResult> {
  const user = await prisma.user.findUnique({ where: { stellarAddress: address } });
  if (!user) throw new NotFoundError('Profile not found');
  const profile = toProfile(user);
  if (!profile) throw new NotFoundError('Profile has been deactivated');
  return profile;
}

export async function reactivateProfile(userId: string): Promise<ProfileResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  if (!user.deletedAt) throw new BadRequestError('Profile is not deactivated');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: null },
  });

  return toProfile(updated)!;
}

async function pinToIPFS(dataUrl: string): Promise<string> {
  if (!config.ipfs.apiUrl) {
    return `sim-${crypto.randomBytes(16).toString('hex')}`;
  }

  const base64Data = dataUrl.split(',')[1];
  const buffer = Buffer.from(base64Data, 'base64');

  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  formData.append('file', blob, 'profile.png');

  const res = await fetch(`${config.ipfs.apiUrl}/api/v0/add`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error(`IPFS pin failed: ${res.statusText}`);
  const result = (await res.json()) as { Hash: string };
  return result.Hash;
}

export async function uploadProfileImage(
  userId: string,
  dataUrl: string,
): Promise<{ profileImageCid: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  const cid = await pinToIPFS(dataUrl);

  await prisma.user.update({
    where: { id: userId },
    data: { profileImageCid: cid },
  });

  return { profileImageCid: cid };
}

/**
 * PATCH /profiles/me — update mutable profile fields for the authenticated user.
 * Username uniqueness and reserved-word rules are enforced before the DB write.
 */
export async function updateProfile(
  userId: string,
  data: UpdateProfileInput,
): Promise<ProfileResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new NotFoundError('Profile not found');

  if (data.username !== undefined) {
    validateUsername(data.username);
    const taken = await prisma.user.findFirst({
      where: {
        username: { equals: data.username, mode: 'insensitive' },
        NOT: { id: userId },
        deletedAt: null,
      },
    });
    if (taken) throw new ConflictError('Username is already taken');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.username !== undefined && { username: data.username }),
    },
  });

  return toProfile(updated)!;
}
