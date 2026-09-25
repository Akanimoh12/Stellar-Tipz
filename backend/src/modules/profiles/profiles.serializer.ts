import type { ProfileResponseDto } from './profiles.dto.js';

const TIERS: { min: number; max: number; label: string }[] = [
  { min: 0, max: 299, label: 'New' },
  { min: 300, max: 499, label: 'Bronze' },
  { min: 500, max: 699, label: 'Silver' },
  { min: 700, max: 849, label: 'Gold' },
  { min: 850, max: 999, label: 'Platinum' },
];

function computeTier(value: number | null | undefined): string {
  if (value == null) return 'New';
  return TIERS.find((t) => value >= t.min && value <= t.max)?.label ?? 'New';
}

interface ProfileRow {
  id: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  imageUrl: string | null;
  avatarCid: string | null;
  creditScore: { value: number; computedAt: Date } | null;
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
    creditScore: profile.creditScore?.value ?? null,
    creditTier: computeTier(profile.creditScore?.value),
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
