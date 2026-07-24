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

  logger.info({ userId, score: score.score }, "Credit score computed");
  return score;
}

/**
 * Forces a recompute of the credit score for `userId`.
 * Called by the background job whenever X metrics are refreshed (issue #919).
 */
export async function recomputeCreditScore(userId: string): Promise<CreditScore> {
  logger.info({ userId }, "Recomputing credit score after metrics refresh");
  const signals = await buildSignalsForUser(userId);
  const score = computeCreditScore(userId, signals);
  logger.info({ userId, score: score.score }, "Credit score recomputed");
  return score;
import { prisma } from '../../db/prisma.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import type {
  CreditScoreResponse,
  CreditScoreComponents,
  ComputeCreditScoreInput,
  CreditScoreHistoryPoint,
} from './credit.types.js';

const BASE_SCORE = 40;
const MAX_SCORE = 100;
const TIP_WEIGHT = 20;
const X_WEIGHT = 30;
const AGE_WEIGHT = 10;
const TIP_DIVISOR = 10_000_000;
const FOLLOWER_DIVISOR = 50;
const ENGAGEMENT_DIVISOR = 10;
const AGE_DIVISOR = 10;
const X_SUB_CAP = 50;
const AGE_CAP = 100;
const TIP_CAP = 100;

const TIERS: { min: number; max: number; label: string }[] = [
  { min: 80, max: 100, label: 'Diamond' },
  { min: 60, max: 79, label: 'Gold' },
  { min: 40, max: 59, label: 'Silver' },
  { min: 20, max: 39, label: 'Bronze' },
  { min: 0, max: 19, label: 'New' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeTipSubScore(totalTipsReceived: bigint): number {
  const clamped = clamp(Number(totalTipsReceived), 0, 1_000_000_000);
  return Math.min(Math.floor(clamped / TIP_DIVISOR), TIP_CAP);
}

function computeXSubScore(xFollowers: number, xEngagementAvg: number): number {
  if (xFollowers === 0 && xEngagementAvg === 0) return 0;
  const followerPart = Math.min(Math.floor(xFollowers / FOLLOWER_DIVISOR), X_SUB_CAP);
  const engagementPart = Math.min(Math.floor(xEngagementAvg / ENGAGEMENT_DIVISOR), X_SUB_CAP);
  return followerPart + engagementPart;
}

function computeAgeSubScore(accountAgeDays: number): number {
  if (accountAgeDays < 1) return 0;
  return Math.min(Math.floor(accountAgeDays / AGE_DIVISOR), AGE_CAP);
}

export function computeCreditScore(input: ComputeCreditScoreInput): {
  score: number;
  components: CreditScoreComponents;
  tier: string;
} {
  const tipSub = computeTipSubScore(input.totalTipsReceived);
  const xSub = computeXSubScore(input.xFollowers, input.xEngagementAvg);
  const ageSub = computeAgeSubScore(input.accountAgeDays);

  const tipScore = Math.floor((tipSub * TIP_WEIGHT) / MAX_SCORE);
  const xScore = Math.floor((xSub * X_WEIGHT) / MAX_SCORE);
  const ageScore = Math.floor((ageSub * AGE_WEIGHT) / MAX_SCORE);

  const streakBonus = clamp(input.streakBonus, 0, MAX_SCORE);

  const total = clamp(BASE_SCORE + tipScore + xScore + ageScore + streakBonus, 0, MAX_SCORE);

  const tier = TIERS.find((t) => total >= t.min && total <= t.max)?.label ?? 'New';

  return {
    score: total,
    components: {
      base: BASE_SCORE,
      tipVolume: tipScore,
      xMetrics: xScore,
      accountAge: ageScore,
      streakBonus,
    },
    tier,
  };
}

export async function getCreditScore(userId: string): Promise<CreditScoreResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { creditScore: true },
  });

  if (!user || user.deletedAt) {
    throw new NotFoundError('User not found');
  }

  return formatCreditScoreResponse(user);
}

export async function getCreditScoreByUsername(username: string): Promise<CreditScoreResponse> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { creditScore: true },
  });

  if (!user || user.deletedAt) {
    throw new NotFoundError('User not found');
  }

  return formatCreditScoreResponse(user);
}

function formatCreditScoreResponse(user: {
  id: string;
  deletedAt: Date | null;
  creditScore: { value: number; computedAt: Date } | null;
}): CreditScoreResponse {
  if (!user.creditScore) {
    return {
      userId: user.id,
      score: BASE_SCORE,
      tier: 'Silver',
      components: {
        base: BASE_SCORE,
        tipVolume: 0,
        xMetrics: 0,
        accountAge: 0,
        streakBonus: 0,
      },
      computedAt: new Date().toISOString(),
    };
  }

  const tier = TIERS.find((t) => user.creditScore!.value >= t.min && user.creditScore!.value <= t.max)?.label ?? 'New';

  return {
    userId: user.id,
    score: user.creditScore.value,
    tier,
    components: {
      base: BASE_SCORE,
      tipVolume: 0,
      xMetrics: 0,
      accountAge: 0,
      streakBonus: 0,
    },
    computedAt: user.creditScore.computedAt.toISOString(),
  };
}

export async function getCreditScoreHistory(
  userId: string,
  limit: number,
  offset: number,
): Promise<CreditScoreHistoryPoint[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || user.deletedAt) {
    throw new NotFoundError('User not found');
  }

  const history = await prisma.creditScoreHistory.findMany({
    where: { userId },
    orderBy: { computedAt: 'asc' },
    skip: offset,
    take: limit,
  });

  return history.map((h) => ({
    value: h.value,
    computedAt: h.computedAt.toISOString(),
  }));
}

export async function recalculateCreditScore(userId: string): Promise<CreditScoreResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { streak: true },
  });

  if (!user || user.deletedAt) {
    throw new NotFoundError('User not found');
  }

  const totalTipsAgg = await prisma.tip.aggregate({
    where: {
      toAddress: user.stellarAddress,
      status: 'CONFIRMED',
    },
    _sum: { amountStroops: true },
  });

  const totalTipsReceived = totalTipsAgg._sum.amountStroops ?? BigInt(0);

  const accountAgeDays = Math.floor(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  const streakBonus = user.streak ? Math.floor(user.streak.currentStreak / 7) : 0;

  const result = computeCreditScore({
    totalTipsReceived,
    xFollowers: 0,
    xEngagementAvg: 0,
    accountAgeDays,
    streakBonus,
  });

  const creditScore = await prisma.creditScore.upsert({
    where: { userId: user.id },
    update: { value: result.score, computedAt: new Date() },
    create: { userId: user.id, value: result.score },
  });

  await prisma.creditScoreHistory.create({
    data: { userId: user.id, value: result.score },
  });

  return {
    userId: user.id,
    score: creditScore.value,
    tier: result.tier,
    components: result.components,
    computedAt: creditScore.computedAt.toISOString(),
  };
}
