export interface TrendingCreator {
  rank: number;
  userId: string;
  username: string | null;
  stellarAddress: string;
  displayName: string | null;
  imageUrl: string | null;
  avatarCid: string | null;
  /** Recency-weighted tip score (higher is trending). */
  trendingScore: number;
  /** Raw confirmed tip volume (stroops) received within the rolling window. */
  recentVolumeStroops: string;
  /** Number of confirmed tips received within the rolling window. */
  recentTipCount: number;
}

export interface TrendingResponse {
  data: TrendingCreator[];
  windowDays: number;
  generatedAt: string;
  /** True when served from a stale/empty cache because a fresh compute failed. */
  stale: boolean;
}

export interface SimilarCreator {
  username: string | null;
  stellarAddress: string;
  displayName: string | null;
  imageUrl: string | null;
  avatarCid: string | null;
  /** Number of distinct supporters this creator shares with the seed creator. */
  sharedSupporters: number;
  /** Total distinct supporters of this creator. */
  supporterCount: number;
}

export interface SimilarResponse {
  data: SimilarCreator[];
  forUsername: string;
  generatedAt: string;
  stale: boolean;
}

/** Human-readable description of the trending formula, surfaced in API docs. */
export const TRENDING_FORMULA_DESCRIPTION = `Recency-weighted tip volume over a rolling window.

For every confirmed tip received by a creator within the last \`windowDays\` days, the
amount (in stroops) is multiplied by an exponential recency weight:

    weight(age_hours) = 0.5 ^ (age_hours / (halflifeDays * 24))

where \`age_hours\` is how long ago the tip arrived. A tip from an hour ago is worth
~2x a tip twice the half-life older. The creator's trending score is the sum of these
weighted amounts. Creators are ranked by score descending.

This is explainable and defensible: it rewards recent, sustained tipping rather than
all-time totals, and every score can be reproduced from the public tip ledger.`;
