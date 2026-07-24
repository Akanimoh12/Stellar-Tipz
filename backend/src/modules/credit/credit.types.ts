/**
 * Shared types for the credit module.
 * Covers issues #920, #919, and #922.
 */

/** Raw input signals used to compute a credit score. */
export interface CreditSignals {
  /** Total number of tips sent by the user (volume metric). */
  tipsSent: number;
  /** Total number of tips received by the user. */
  tipsReceived: number;
  /** Current tipping streak (days). */
  streak: number;
  /** X (Twitter) follower count — 0 if unlinked. */
  xFollowers: number;
  /** X (Twitter) engagement rate 0‑1 — null if unavailable. */
  xEngagement: number | null;
  /** Count of self-tips (tipper === recipient address). Used for anti-gaming. */
  selfTips: number;
  /** Wash-tip ratio: fraction of tips that appear circular (0‑1). */
  washTipRatio: number;
}

/** Computed credit score result. */
export interface CreditScore {
  /** User ID the score belongs to. */
  userId: string;
  /**
   * Final credit score, clamped to [0, 100] (issue #920).
   * Higher is better.
   */
  score: number;
  /** Breakdown of weighted sub-scores for transparency. */
  breakdown: {
    volumeScore: number;
    streakScore: number;
    socialScore: number;
    /** Penalty deducted for self-tipping / wash-tipping (issue #922). */
    antiGamingPenalty: number;
  };
  /** ISO-8601 timestamp of when the score was last computed. */
  computedAt: string;
}

/** Stored credit score row returned from the DB (future CreditScore model). */
export interface CreditScoreRecord {
  id: string;
  userId: string;
  score: number;
export interface CreditScoreResponse {
  userId: string;
  score: number;
  tier: string;
  components: CreditScoreComponents;
  computedAt: string;
}

export interface CreditScoreComponents {
  base: number;
  tipVolume: number;
  xMetrics: number;
  accountAge: number;
  streakBonus: number;
}

export interface ComputeCreditScoreInput {
  totalTipsReceived: bigint;
  xFollowers: number;
  xEngagementAvg: number;
  accountAgeDays: number;
  streakBonus: number;
}

export interface CreditScoreHistoryPoint {
  value: number;
  computedAt: string;
}
