import { prisma } from '../../db/prisma.js';
import { redis } from '../../db/redis.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
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
const CREDIT_SCORE_CACHE_TTL_SECONDS = 5 * 60;

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

function cacheKeyForUser(userId: string): string {
  return `credit:score:user:${userId}`;
}

function cacheKeyForUsername(username: string): string {
  return `credit:score:username:${username.toLowerCase()}`;
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

async function readCachedScore(key: string): Promise<CreditScoreResponse | null> {
  try {
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as CreditScoreResponse) : null;
  } catch (err) {
    logger.warn({ err, key }, 'Credit score cache read failed');
    return null;
  }
}

async function writeCachedScore(keys: string[], score: CreditScoreResponse): Promise<void> {
  try {
    const payload = JSON.stringify(score);
    await Promise.all(
      keys.map((key) => redis.set(key, payload, 'EX', CREDIT_SCORE_CACHE_TTL_SECONDS)),
    );
  } catch (err) {
    logger.warn({ err, keys }, 'Credit score cache write failed');
  }
}

/** Pure credit score formula from persisted creator signals. */
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
  const tier = TIERS.find((item) => total >= item.min && total <= item.max)?.label ?? 'New';

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

  const tier =
    TIERS.find((item) => user.creditScore!.value >= item.min && user.creditScore!.value <= item.max)
      ?.label ?? 'New';

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

/** Returns a cached or stored credit score for a user id. */
export async function getCreditScore(userId: string): Promise<CreditScoreResponse> {
  const cacheKey = cacheKeyForUser(userId);
  const cached = await readCachedScore(cacheKey);
  if (cached) return cached;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { creditScore: true },
  });

  if (!user || user.deletedAt) {
    throw new NotFoundError('User not found');
  }

  const result = formatCreditScoreResponse(user);
  await writeCachedScore([cacheKey], result);
  return result;
}

/** Returns a cached or stored credit score for a username. */
export async function getCreditScoreByUsername(username: string): Promise<CreditScoreResponse> {
  const cacheKey = cacheKeyForUsername(username);
  const cached = await readCachedScore(cacheKey);
  if (cached) return cached;

  const user = await prisma.user.findUnique({
    where: { username },
    include: { creditScore: true },
  });

  if (!user || user.deletedAt) {
    throw new NotFoundError('User not found');
  }

  const result = formatCreditScoreResponse(user);
  await writeCachedScore([cacheKey, cacheKeyForUser(user.id)], result);
  return result;
}

/** Returns the score history time series for a creator. */
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

  return history.map((point) => ({
    value: point.value,
    computedAt: point.computedAt.toISOString(),
  }));
}

/** Recomputes, stores, histories, and caches a user's credit score. */
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

  // Transactional boundary: creditScore upsert + history insert are atomic
  // (isolation ReadCommitted, timeout 5000ms). Reads and cache writes stay outside.
  const creditScore = await prisma.$transaction(
    async (tx) => {
      const cs = await tx.creditScore.upsert({
        where: { userId: user.id },
        update: { value: result.score, computedAt: new Date() },
        create: { userId: user.id, value: result.score },
      });
      await tx.creditScoreHistory.create({
        data: { userId: user.id, value: result.score },
      });
      return cs;
    },
    {
      timeout: 5000,
      maxWait: 2000,
      isolationLevel: "ReadCommitted",
    },
  );

  const response = {
    userId: user.id,
    score: creditScore.value,
    tier: result.tier,
    components: result.components,
    computedAt: creditScore.computedAt.toISOString(),
  };
  const keys = [cacheKeyForUser(user.id)];
  if (user.username) keys.push(cacheKeyForUsername(user.username));
  await writeCachedScore(keys, response);

  return response;
}
