/**
 * Profile response DTOs. These define the shape of data returned by the API,
 * ensuring private fields are never leaked.
 */

/** Public profile response — safe for any consumer. */
export interface ProfileResponseDto {
  id: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  imageUrl: string | null;
  avatarCid: string | null;
  xHandle: string | null;
  createdAt: string;
  updatedAt: string;
  tipsCount: number;
  totalReceived: string;
}

/** Paginated list of profiles. */
export interface PaginatedProfilesDto {
  profiles: ProfileResponseDto[];
  total: number;
  page: number;
  limit: number;
}
