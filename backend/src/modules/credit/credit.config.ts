/**
 * Credit score configuration and weights.
 * All weights and divisors can be overridden via environment variables.
 */

interface CreditScoreConfig {
  weights: {
    base: number;
    tip: number;
    x: number;
    age: number;
  };
  divisors: {
    tip: number;
    follower: number;
    engagement: number;
    age: number;
  };
  caps: {
    base: number;
    max: number;
    xSub: number;
    ageSub: number;
    tipSub: number;
    streakBonus: number;
  };
  cacheTtlSeconds: number;
}

function parseEnvNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function loadCreditScoreConfig(): CreditScoreConfig {
  return {
    weights: {
      base: parseEnvNumber(process.env.CREDIT_SCORE_WEIGHT_BASE, 40),
      tip: parseEnvNumber(process.env.CREDIT_SCORE_WEIGHT_TIP, 20),
      x: parseEnvNumber(process.env.CREDIT_SCORE_WEIGHT_X, 30),
      age: parseEnvNumber(process.env.CREDIT_SCORE_WEIGHT_AGE, 10),
    },
    divisors: {
      tip: parseEnvNumber(process.env.CREDIT_SCORE_DIVISOR_TIP, 10_000_000),
      follower: parseEnvNumber(process.env.CREDIT_SCORE_DIVISOR_FOLLOWER, 50),
      engagement: parseEnvNumber(process.env.CREDIT_SCORE_DIVISOR_ENGAGEMENT, 10),
      age: parseEnvNumber(process.env.CREDIT_SCORE_DIVISOR_AGE, 10),
    },
    caps: {
      base: parseEnvNumber(process.env.CREDIT_SCORE_CAP_BASE, 40),
      max: parseEnvNumber(process.env.CREDIT_SCORE_CAP_MAX, 100),
      xSub: parseEnvNumber(process.env.CREDIT_SCORE_CAP_X_SUB, 50),
      ageSub: parseEnvNumber(process.env.CREDIT_SCORE_CAP_AGE_SUB, 100),
      tipSub: parseEnvNumber(process.env.CREDIT_SCORE_CAP_TIP_SUB, 100),
      // Maximum number of points the streak bonus may ever contribute. Bounded
      // so that a long streak cannot dominate the weighted signals (tips, X,
      // account age) inside the 0-100 score. Must stay in sync with
      // STREAK_BONUS_CAP in contracts/tipz/src/credit.rs.
      streakBonus: parseEnvNumber(process.env.CREDIT_SCORE_CAP_STREAK_BONUS, 10),
    },
    cacheTtlSeconds: parseEnvNumber(process.env.CREDIT_SCORE_CACHE_TTL_SECONDS, 5 * 60),
  };
}

export const creditScoreConfig = loadCreditScoreConfig();
