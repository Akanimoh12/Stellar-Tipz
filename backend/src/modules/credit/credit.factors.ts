/**
 * Credit score factors and weights breakdown.
 * Exposes the contributing factors in a human-readable format.
 */

import { creditScoreConfig } from './credit.config.js';

export interface CreditFactorBreakdown {
  name: string;
  weight: number;
  maxContribution: number;
  description: string;
  divisor?: number;
  cap?: number;
}

export interface CreditScoreFactors {
  factors: CreditFactorBreakdown[];
  totalWeight: number;
  maxScore: number;
  baseScore: number;
}

/**
 * Returns the complete credit score factors breakdown.
 * This exposes all contributing factors and their weights for transparency.
 */
export function getCreditScoreFactors(): CreditScoreFactors {
  const config = creditScoreConfig;
  const maxScore = config.caps.max;

  const factors: CreditFactorBreakdown[] = [
    {
      name: 'Base Score',
      weight: 0,
      maxContribution: config.weights.base,
      description: 'Flat score given to all registered creators',
      cap: config.weights.base,
    },
    {
      name: 'Tip Volume',
      weight: config.weights.tip,
      maxContribution: Math.floor((100 * config.weights.tip) / maxScore),
      description: 'Total XLM received from tips',
      divisor: config.divisors.tip,
      cap: config.caps.tipSub,
    },
    {
      name: 'X Metrics',
      weight: config.weights.x,
      maxContribution: Math.floor((100 * config.weights.x) / maxScore),
      description: 'X (Twitter) followers and engagement',
      divisor: config.divisors.follower,
      cap: config.caps.xSub,
    },
    {
      name: 'Account Age',
      weight: config.weights.age,
      maxContribution: Math.floor((100 * config.weights.age) / maxScore),
      description: 'Days since account creation',
      divisor: config.divisors.age,
      cap: config.caps.ageSub,
    },
  ];

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);

  return {
    factors,
    totalWeight,
    maxScore: config.caps.max,
    baseScore: config.weights.base,
  };
}

/**
 * Returns the configuration for all credit score constants.
 * This is used for transparency and API exposure.
 */
export function getCreditScoreConfig() {
  return creditScoreConfig;
}

/**
 * Formats a factor breakdown for API response.
 */
export function formatFactorForResponse(factor: CreditFactorBreakdown) {
  const result: Record<string, unknown> = {
    name: factor.name,
    weight: factor.weight,
    maxContribution: factor.maxContribution,
    description: factor.description,
  };

  if (factor.divisor) {
    result.divisor = factor.divisor;
  }

  if (factor.cap) {
    result.cap = factor.cap;
  }

  return result;
}
