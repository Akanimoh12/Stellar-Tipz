import type { ProfileResponseDto } from './profiles.dto.js';

interface ProfileRow {
  id: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  imageUrl: string | null;
  avatarCid: string | null;
  xHandle: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Serializes a database profile row into a safe API response DTO.
 * Only exposes public fields — never leaks private/internal data.
 */
export function serializeProfile(
  profile: ProfileRow,
  stats: { tipsCount: number; totalReceived: string },
): ProfileResponseDto {
  return {
    id: profile.id,
    stellarAddress: profile.stellarAddress,
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    imageUrl: profile.imageUrl,
    avatarCid: profile.avatarCid,
    xHandle: profile.xHandle,
    createdAt:
      profile.createdAt instanceof Date
        ? profile.createdAt.toISOString()
        : profile.createdAt,
    updatedAt:
      profile.updatedAt instanceof Date
        ? profile.updatedAt.toISOString()
        : profile.updatedAt,
    tipsCount: stats.tipsCount,
    totalReceived: stats.totalReceived,
  };
}
