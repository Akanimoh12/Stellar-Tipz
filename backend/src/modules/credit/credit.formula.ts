/**
 * Pure credit score formula functions.
 * All functions are deterministic and have no side effects.
 * Configuration is passed as parameters for testability.
 */

export interface CreditScoreFormula {
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
  };
}

/**
 * Pure utility to clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Pure function: compute tip sub-score from total tips received.
 * Converts stroops to a 0–cap value.
 */
export function computeTipSubScore(totalTipsReceived: bigint, config: CreditScoreFormula): number {
  const clamped = clamp(Number(totalTipsReceived), 0, 1_000_000_000);
  return Math.min(Math.floor(clamped / config.divisors.tip), config.caps.tipSub);
}

/**
 * Pure function: compute X sub-score from followers and engagement.
 * Returns 0 if both followers and engagement are 0 (not registered on X).
 * Otherwise, combines follower and engagement components, each capped at xSub/2.
 */
export function computeXSubScore(
  xFollowers: number,
  xEngagementAvg: number,
  config: CreditScoreFormula,
): number {
  if (xFollowers === 0 && xEngagementAvg === 0) return 0;

  const followerPart = Math.min(
    Math.floor(xFollowers / config.divisors.follower),
    config.caps.xSub,
  );
  const engagementPart = Math.min(
    Math.floor(xEngagementAvg / config.divisors.engagement),
    config.caps.xSub,
  );

  return Math.min(followerPart + engagementPart, config.caps.max);
}

/**
 * Pure function: compute account age sub-score from days since account creation.
 * Accounts younger than 1 day contribute 0.
 * Result is capped at ageSub.
 */
export function computeAgeSubScore(accountAgeDays: number, config: CreditScoreFormula): number {
  if (accountAgeDays < 1) return 0;
  return Math.min(Math.floor(accountAgeDays / config.divisors.age), config.caps.ageSub);
}

/**
 * Pure function: compute the weighted score from a sub-score.
 * Applies weight percentage and caps at max score.
 */
export function applyWeight(subScore: number, weight: number, maxScore: number): number {
  return Math.floor((subScore * weight) / maxScore);
}

/**
 * Pure function: compute total credit score and breakdown components.
 * This is the core formula: pure, deterministic, and fully testable.
 */
export interface CreditScoreComputeInput {
  totalTipsReceived: bigint;
  xFollowers: number;
  xEngagementAvg: number;
  accountAgeDays: number;
  streakBonus: number;
}

export interface CreditScoreComponents {
  base: number;
  tipVolume: number;
  xMetrics: number;
  accountAge: number;
  streakBonus: number;
}

export interface CreditScoreResult {
  score: number;
  components: CreditScoreComponents;
  tier: string;
}

export function computeCreditScore(
  input: CreditScoreComputeInput,
  config: CreditScoreFormula,
  tiers: Array<{ min: number; max: number; label: string }>,
): CreditScoreResult {
  // Compute sub-scores (capped at config.caps.max)
  const tipSub = computeTipSubScore(input.totalTipsReceived, config);
  const xSub = computeXSubScore(input.xFollowers, input.xEngagementAvg, config);
  const ageSub = computeAgeSubScore(input.accountAgeDays, config);

  // Apply weights to sub-scores
  const tipScore = applyWeight(tipSub, config.weights.tip, config.caps.max);
  const xScore = applyWeight(xSub, config.weights.x, config.caps.max);
  const ageScore = applyWeight(ageSub, config.weights.age, config.caps.max);
  const streakBonus = clamp(input.streakBonus, 0, config.caps.max);

  // Combine components and cap at max
  const total = clamp(
    config.weights.base + tipScore + xScore + ageScore + streakBonus,
    0,
    config.caps.max,
  );

  // Determine tier
  const tier = tiers.find((t) => total >= t.min && total <= t.max)?.label ?? 'New';

  return {
    score: total,
    components: {
      base: config.weights.base,
      tipVolume: tipScore,
      xMetrics: xScore,
      accountAge: ageScore,
      streakBonus,
    },
    tier,
  };
}

/**
 * Returns the tier definition based on score.
 */
export function getTierForScore(
  score: number,
  tiers: Array<{ min: number; max: number; label: string }>,
): string {
  return tiers.find((t) => score >= t.min && score <= t.max)?.label ?? 'New';
}
