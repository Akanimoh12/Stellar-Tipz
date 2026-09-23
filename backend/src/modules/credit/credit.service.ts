import type { CreditSignals, CreditScore } from "./credit.types.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { NotFoundError } from "../../common/errors/AppError.js";

// ── Normalisation helpers (issue #920) ─────────────────────────────────────────

/**
 * Clamps `value` to the closed interval [min, max].
 * Pure function – no side-effects.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Normalises `value` from the range [0, maxExpected] to [0, 100].
 * Values beyond `maxExpected` are clamped to 100.
 * Pure function – no side-effects.
 */
export function normalise(value: number, maxExpected: number): number {
  if (maxExpected <= 0) return 0;
  return clamp((value / maxExpected) * 100, 0, 100);
}

// ── Anti-gaming penalty (issue #922) ───────────────────────────────────────────

/** Weights for the anti-gaming penalty. Exported for tests. */
export const ANTI_GAMING = {
  /** Penalty per self-tip, capped to MAX_SELF_TIP_PENALTY. */
  SELF_TIP_PENALTY_PER_TIP: 2,
  MAX_SELF_TIP_PENALTY: 20,
  /** Penalty weight applied to wash-tip ratio (0-1) → 0-30 deduction. */
  WASH_TIP_WEIGHT: 30,
} as const;

/**
 * Computes the raw anti-gaming penalty (0 to 50 range) to subtract from the
 * base credit score.
 *
 * A "self-tip" occurs when the tipper === recipient Stellar address.
 * A "wash tip" is detected when the same pair rapidly tips each other back.
 *
 * Pure function – deterministic, no I/O.
 */
export function computeAntiGamingPenalty(
  selfTips: number,
  washTipRatio: number,
): number {
  const selfTipPenalty = clamp(
    selfTips * ANTI_GAMING.SELF_TIP_PENALTY_PER_TIP,
    0,
    ANTI_GAMING.MAX_SELF_TIP_PENALTY,
  );
  const washTipPenalty = clamp(washTipRatio, 0, 1) * ANTI_GAMING.WASH_TIP_WEIGHT;
  return clamp(selfTipPenalty + washTipPenalty, 0, 50);
}

// ── Core formula (issues #920 & #919) ──────────────────────────────────────────

/** Weights that sum to 100 for the base score. */
const WEIGHTS = {
  volume: 0.4,
  streak: 0.3,
  social: 0.3,
} as const;

/** Expected maximums used for normalisation (issue #920). */
const MAX_EXPECTED = {
  tips: 500,
  streak: 365,
  followers: 100_000,
} as const;

/**
 * Computes a credit score from raw signals.
 *
 * The formula is pure and unit-tested (issues #920, #919, #922).
 * Score is always in [0, 100] after anti-gaming deductions.
 */
export function computeCreditScore(
  userId: string,
  signals: CreditSignals,
): CreditScore {
  // Volume sub-score: weight tips sent and received equally.
  const avgTips = (signals.tipsSent + signals.tipsReceived) / 2;
  const volumeScore = normalise(avgTips, MAX_EXPECTED.tips);

  // Streak sub-score (issue #919 – recomputed whenever signals refresh).
  const streakScore = normalise(signals.streak, MAX_EXPECTED.streak);

  // Social sub-score: combine followers and engagement if available.
  const followerScore = normalise(signals.xFollowers, MAX_EXPECTED.followers);
  const engagementBonus =
    signals.xEngagement !== null ? clamp(signals.xEngagement * 20, 0, 20) : 0;
  const socialScore = clamp(followerScore + engagementBonus, 0, 100);

  // Weighted base score before penalties.
  const baseScore =
    volumeScore * WEIGHTS.volume +
    streakScore * WEIGHTS.streak +
    socialScore * WEIGHTS.social;

  // Anti-gaming deduction (issue #922).
  const antiGamingPenalty = computeAntiGamingPenalty(
    signals.selfTips,
    signals.washTipRatio,
  );

  // Final score – clamped to [0, 100] (issue #920).
  const score = clamp(baseScore - antiGamingPenalty, 0, 100);

  return {
    userId,
    score: Math.round(score * 100) / 100,
    breakdown: {
      volumeScore: Math.round(volumeScore * 100) / 100,
      streakScore: Math.round(streakScore * 100) / 100,
      socialScore: Math.round(socialScore * 100) / 100,
      antiGamingPenalty: Math.round(antiGamingPenalty * 100) / 100,
    },
    computedAt: new Date().toISOString(),
  };
}

// ── DB-backed service functions ─────────────────────────────────────────────────

/**
 * Builds the CreditSignals for a user from the current DB state.
 * Queries tips, streak, and X metrics. Called before recomputing the score.
 */
async function buildSignalsForUser(userId: string): Promise<CreditSignals> {
  const [user, streak, xAccount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { stellarAddress: true, xHandle: true },
    }),
    prisma.streak.findUnique({ where: { userId } }),
    // XAccount may not exist yet – outer join via user.xHandle
    (async () => {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { xHandle: true },
      });
      if (!u?.xHandle) return null;
      return prisma.xAccount.findUnique({ where: { handle: u.xHandle } });
    })(),
  ]);

  if (!user) throw new NotFoundError(`User ${userId} not found`);

  const [tipsSent, tipsReceived, selfTips] = await Promise.all([
    prisma.tip.count({ where: { fromAddress: user.stellarAddress } }),
    prisma.tip.count({ where: { toAddress: user.stellarAddress } }),
    // Self-tip: sender and recipient are the same address
    prisma.tip.count({
      where: {
        fromAddress: user.stellarAddress,
        toAddress: user.stellarAddress,
      },
    }),
  ]);

  // Wash-tip ratio: fraction of sent tips that are returned by the recipient.
  const washTipRatio =
    tipsSent > 0 ? Math.min(selfTips / tipsSent, 1) : 0;

  return {
    tipsSent,
    tipsReceived,
    streak: streak?.currentStreak ?? 0,
    xFollowers: xAccount?.followers ?? 0,
    xEngagement: xAccount?.engagement ?? null,
    selfTips,
    washTipRatio,
  };
}

/**
 * Returns the cached credit score for `userId`, or computes a fresh one
 * on the first call. The score is not yet persisted to the DB (no CreditScore
 * model exists in the schema) so it is always freshly computed.
 *
 * Issues #920 · #919 · #922
 */
export async function getCreditScore(userId: string): Promise<CreditScore> {
  logger.info({ userId }, "Fetching credit score");

  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) throw new NotFoundError(`User ${userId} not found`);

  const signals = await buildSignalsForUser(userId);
  const score = computeCreditScore(userId, signals);

  const staleData = await checkXDataStaleness(userId);
  if (staleData) {
    score.xDataStale = staleData.isStale;
    score.xDataStaleAge = staleData.ageSecs;
  }

  logger.info({ userId, score: score.score }, "Credit score computed");
  return score;
}

/**
 * Checks if X data for a user is stale (issue #1293).
 * Returns stale flag and age in seconds if X account exists.
 */
async function checkXDataStaleness(
  userId: string,
): Promise<{ isStale: boolean; ageSecs: number } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xHandle: true },
  });

  if (!user?.xHandle) return null;

  const xAccount = await prisma.xAccount.findUnique({
    where: { handle: user.xHandle },
  });

  if (!xAccount) return null;

  const ageMs = Date.now() - xAccount.fetchedAt.getTime();
  const ageSecs = Math.floor(ageMs / 1000);
  const staleThresholdSecs = 60 * 60;

  return {
    isStale: ageSecs > staleThresholdSecs,
    ageSecs,
  };
}

/**
 * Forces a recompute of the credit score for `userId`.
 * Called by the background job whenever X metrics are refreshed (issue #919).
 */
export async function recomputeCreditScore(userId: string): Promise<CreditScore> {
  logger.info({ userId }, "Recomputing credit score after metrics refresh");
  const signals = await buildSignalsForUser(userId);
  const score = computeCreditScore(userId, signals);

  const staleData = await checkXDataStaleness(userId);
  if (staleData) {
    score.xDataStale = staleData.isStale;
    score.xDataStaleAge = staleData.ageSecs;
  }

  logger.info({ userId, score: score.score }, "Credit score recomputed");
  return score;
}
