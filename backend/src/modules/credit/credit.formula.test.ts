import { describe, expect, it } from 'vitest';
import {
  clamp,
  computeTipSubScore,
  computeXSubScore,
  computeAgeSubScore,
  applyWeight,
  computeCreditScore,
  getTierForScore,
  type CreditScoreFormula,
} from './credit.formula.js';

const defaultConfig: CreditScoreFormula = {
  weights: {
    base: 40,
    tip: 20,
    x: 30,
    age: 10,
  },
  divisors: {
    tip: 10_000_000,
    follower: 50,
    engagement: 10,
    age: 10,
  },
  caps: {
    base: 40,
    max: 100,
    xSub: 50,
    ageSub: 100,
    tipSub: 100,
  },
};

const tiers = [
  { min: 80, max: 100, label: 'Diamond' },
  { min: 60, max: 79, label: 'Gold' },
  { min: 40, max: 59, label: 'Silver' },
  { min: 20, max: 39, label: 'Bronze' },
  { min: 0, max: 19, label: 'New' },
];

describe('clamp', () => {
  it('returns the value when within bounds', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it('returns min when value is below min', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it('returns max when value is above max', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });
});

describe('computeTipSubScore', () => {
  it('returns 0 for no tips', () => {
    const result = computeTipSubScore(BigInt(0), defaultConfig);
    expect(result).toBe(0);
  });

  it('returns 1 for 10 XLM (10,000,000 stroops)', () => {
    const result = computeTipSubScore(BigInt(10_000_000), defaultConfig);
    expect(result).toBe(1);
  });

  it('returns 10 for 100 XLM (100,000,000 stroops)', () => {
    const result = computeTipSubScore(BigInt(100_000_000), defaultConfig);
    expect(result).toBe(10);
  });

  it('caps at tipSub cap (100)', () => {
    const result = computeTipSubScore(BigInt(10_000_000_000), defaultConfig);
    expect(result).toBe(100);
  });

  it('respects custom divisor', () => {
    const config: CreditScoreFormula = {
      ...defaultConfig,
      divisors: { ...defaultConfig.divisors, tip: 5_000_000 },
    };
    const result = computeTipSubScore(BigInt(10_000_000), config);
    expect(result).toBe(2);
  });
});

describe('computeXSubScore', () => {
  it('returns 0 when no X presence', () => {
    const result = computeXSubScore(0, 0, defaultConfig);
    expect(result).toBe(0);
  });

  it('computes follower component', () => {
    const result = computeXSubScore(500, 0, defaultConfig);
    expect(result).toBe(10);
  });

  it('computes engagement component', () => {
    const result = computeXSubScore(0, 100, defaultConfig);
    expect(result).toBe(10);
  });

  it('combines follower and engagement components', () => {
    const result = computeXSubScore(500, 100, defaultConfig);
    expect(result).toBe(20);
  });

  it('caps each component at xSub (50)', () => {
    const result = computeXSubScore(10000, 1000, defaultConfig);
    expect(result).toBe(100);
  });

  it('respects custom divisors', () => {
    const config: CreditScoreFormula = {
      ...defaultConfig,
      divisors: { ...defaultConfig.divisors, follower: 100, engagement: 20 },
    };
    const result = computeXSubScore(500, 100, config);
    expect(result).toBe(10);
  });
});

describe('computeAgeSubScore', () => {
  it('returns 0 for accounts less than 1 day old', () => {
    const result = computeAgeSubScore(0.5, defaultConfig);
    expect(result).toBe(0);
  });

  it('returns 0 for accounts exactly 1 day old', () => {
    const result = computeAgeSubScore(1, defaultConfig);
    expect(result).toBe(0);
  });

  it('returns 1 for 10 days old', () => {
    const result = computeAgeSubScore(10, defaultConfig);
    expect(result).toBe(1);
  });

  it('returns 100 for 1000 days old', () => {
    const result = computeAgeSubScore(1000, defaultConfig);
    expect(result).toBe(100);
  });

  it('caps at ageSub cap (100)', () => {
    const result = computeAgeSubScore(10000, defaultConfig);
    expect(result).toBe(100);
  });

  it('respects custom divisor', () => {
    const config: CreditScoreFormula = {
      ...defaultConfig,
      divisors: { ...defaultConfig.divisors, age: 20 },
    };
    const result = computeAgeSubScore(200, config);
    expect(result).toBe(10);
  });
});

describe('applyWeight', () => {
  it('applies weight correctly', () => {
    const result = applyWeight(50, 20, 100);
    expect(result).toBe(10);
  });

  it('floors the result', () => {
    const result = applyWeight(33, 20, 100);
    expect(result).toBe(6);
  });

  it('handles 0 weight', () => {
    const result = applyWeight(100, 0, 100);
    expect(result).toBe(0);
  });

  it('respects custom max score', () => {
    const result = applyWeight(50, 30, 150);
    expect(result).toBe(10);
  });
});

describe('computeCreditScore (full formula)', () => {
  it('returns base score for new creator with no activity', () => {
    const result = computeCreditScore(
      {
        totalTipsReceived: BigInt(0),
        xFollowers: 0,
        xEngagementAvg: 0,
        accountAgeDays: 0,
        streakBonus: 0,
      },
      defaultConfig,
      tiers,
    );

    expect(result.score).toBe(40);
    expect(result.tier).toBe('Silver');
    expect(result.components.base).toBe(40);
    expect(result.components.tipVolume).toBe(0);
    expect(result.components.xMetrics).toBe(0);
    expect(result.components.accountAge).toBe(0);
    expect(result.components.streakBonus).toBe(0);
  });

  it('combines all components correctly', () => {
    const result = computeCreditScore(
      {
        totalTipsReceived: BigInt(100_000_000), // 10 XLM
        xFollowers: 500,
        xEngagementAvg: 100,
        accountAgeDays: 100,
        streakBonus: 5,
      },
      defaultConfig,
      tiers,
    );

    expect(result.score).toBeGreaterThan(40);
    expect(result.tier).toBe('Silver');
    expect(result.components.base).toBe(40);
    expect(result.components.tipVolume).toBeGreaterThan(0);
    expect(result.components.xMetrics).toBeGreaterThan(0);
    expect(result.components.accountAge).toBeGreaterThan(0);
    expect(result.components.streakBonus).toBe(5);
  });

  it('caps at max score (100)', () => {
    const result = computeCreditScore(
      {
        totalTipsReceived: BigInt(10_000_000_000),
        xFollowers: 10000,
        xEngagementAvg: 1000,
        accountAgeDays: 10000,
        streakBonus: 100,
      },
      defaultConfig,
      tiers,
    );

    expect(result.score).toBe(100);
    expect(result.tier).toBe('Diamond');
  });

  it('assigns Diamond tier for high scores', () => {
    const result = computeCreditScore(
      {
        totalTipsReceived: BigInt(1_000_000_000),
        xFollowers: 2500,
        xEngagementAvg: 200,
        accountAgeDays: 365,
        streakBonus: 10,
      },
      defaultConfig,
      tiers,
    );

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.tier).toBe('Diamond');
  });

  it('assigns Gold tier for mid-range scores', () => {
    const result = computeCreditScore(
      {
        totalTipsReceived: BigInt(100_000_000),
        xFollowers: 1000,
        xEngagementAvg: 100,
        accountAgeDays: 180,
        streakBonus: 5,
      },
      defaultConfig,
      tiers,
    );

    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThan(80);
    expect(result.tier).toBe('Gold');
  });

  it('respects configurable weights', () => {
    const customConfig: CreditScoreFormula = {
      ...defaultConfig,
      weights: { base: 50, tip: 30, x: 10, age: 10 },
    };

    const result = computeCreditScore(
      {
        totalTipsReceived: BigInt(100_000_000),
        xFollowers: 500,
        xEngagementAvg: 0,
        accountAgeDays: 100,
        streakBonus: 0,
      },
      customConfig,
      tiers,
    );

    expect(result.components.base).toBe(50);
    expect(result.score).toBeGreaterThan(50);
  });

  it('handles zero streak bonus correctly', () => {
    const result = computeCreditScore(
      {
        totalTipsReceived: BigInt(0),
        xFollowers: 0,
        xEngagementAvg: 0,
        accountAgeDays: 0,
        streakBonus: 0,
      },
      defaultConfig,
      tiers,
    );

    expect(result.components.streakBonus).toBe(0);
    expect(result.score).toBe(40);
  });

  it('clamps negative streak bonus to 0', () => {
    const result = computeCreditScore(
      {
        totalTipsReceived: BigInt(0),
        xFollowers: 0,
        xEngagementAvg: 0,
        accountAgeDays: 0,
        streakBonus: -5,
      },
      defaultConfig,
      tiers,
    );

    expect(result.components.streakBonus).toBe(0);
  });

  it('clamps excessive streak bonus to max', () => {
    const result = computeCreditScore(
      {
        totalTipsReceived: BigInt(0),
        xFollowers: 0,
        xEngagementAvg: 0,
        accountAgeDays: 0,
        streakBonus: 200,
      },
      defaultConfig,
      tiers,
    );

    expect(result.components.streakBonus).toBe(100);
    expect(result.score).toBe(100);
  });
});

describe('getTierForScore', () => {
  it('returns Diamond for 80-100', () => {
    expect(getTierForScore(80, tiers)).toBe('Diamond');
    expect(getTierForScore(100, tiers)).toBe('Diamond');
  });

  it('returns Gold for 60-79', () => {
    expect(getTierForScore(60, tiers)).toBe('Gold');
    expect(getTierForScore(79, tiers)).toBe('Gold');
  });

  it('returns Silver for 40-59', () => {
    expect(getTierForScore(40, tiers)).toBe('Silver');
    expect(getTierForScore(59, tiers)).toBe('Silver');
  });

  it('returns Bronze for 20-39', () => {
    expect(getTierForScore(20, tiers)).toBe('Bronze');
    expect(getTierForScore(39, tiers)).toBe('Bronze');
  });

  it('returns New for 0-19', () => {
    expect(getTierForScore(0, tiers)).toBe('New');
    expect(getTierForScore(19, tiers)).toBe('New');
  });

  it('returns New for unmatched scores', () => {
    expect(getTierForScore(101, tiers)).toBe('New');
  });
});
