/**
 * Credit score validation against shared test vectors (issue #XXX).
 *
 * This test suite ensures the TypeScript backend implementation matches the
 * shared credit_score_vectors.json file from the Soroban contract. Both
 * implementations are validated in CI with the same test data.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { computeCreditScore, type CreditScoreFormula } from '../src/modules/credit/credit.formula';

// Default formula config matching credit.formula.test.ts and Rust contract defaults.
const defaultConfig: CreditScoreFormula = {
  weights: { base: 40, tip: 20, x: 30, age: 10 },
  divisors: { tip: 10_000_000, follower: 50, engagement: 10, age: 10 },
  caps: { base: 40, max: 100, xSub: 50, ageSub: 100, tipSub: 100, streakBonus: 10 },
};

const tiers = [
  { min: 80, max: 100, label: 'Diamond' },
  { min: 60, max: 79, label: 'Gold' },
  { min: 40, max: 59, label: 'Silver' },
  { min: 20, max: 39, label: 'Bronze' },
  { min: 0, max: 19, label: 'New' },
];

function computeScore(input: {
  totalTipsReceived: bigint;
  xFollowers: number;
  xEngagementAvg: number;
  accountAgeDays: number;
  streakBonus: number;
}): number {
  return computeCreditScore(input, defaultConfig, tiers).score;
}

// ── Vector file structures ────────────────────────────────────────────

interface CreditScoreInputs {
  total_tips_received_stroops: number;
  x_followers: number;
  x_engagement_avg: number;
  account_age_seconds: number;
  streak_bonus: number;
}

interface CreditScoreTestVector {
  id: string;
  description: string;
  inputs: CreditScoreInputs;
  expected_score: number;
  tier: string;
}

interface VectorFile {
  version: string;
  description: string;
  algorithm: string;
  vectors: CreditScoreTestVector[];
}

// ── Helper to load and parse vectors ──────────────────────────────────────

function loadTestVectors(): VectorFile {
  const vectorPath = path.join(
    __dirname,
    '../../contracts/tipz/tests/credit_score_vectors.json'
  );
  const jsonContent = fs.readFileSync(vectorPath, 'utf-8');
  return JSON.parse(jsonContent) as VectorFile;
}

/**
 * Convert account age from seconds to days (matching Rust behavior).
 */
function accountAgeSecondsToDays(seconds: number): number {
  return Math.floor(seconds / 86400); // 86400 seconds per day
}

/**
 * Get credit tier name from score (must match tiers in JSON).
 */
function getTier(score: number): string {
  if (score <= 19) return 'New';
  if (score <= 39) return 'Bronze';
  if (score <= 59) return 'Silver';
  if (score <= 79) return 'Gold';
  return 'Diamond';
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Credit Score Vectors', () => {
  const vectors = loadTestVectors();

  it('should validate all test vectors against formula', () => {
    const results = vectors.vectors.map((vector) => {
      // Convert account age from seconds to days (TypeScript formula receives days)
      const accountAgeDays = accountAgeSecondsToDays(vector.inputs.account_age_seconds);

      // Prepare input for TypeScript formula
      const input = {
        totalTipsReceived: BigInt(vector.inputs.total_tips_received_stroops),
        xFollowers: vector.inputs.x_followers,
        xEngagementAvg: vector.inputs.x_engagement_avg,
        accountAgeDays: accountAgeDays,
        streakBonus: vector.inputs.streak_bonus,
      };

      // Call the TypeScript implementation
      const calculatedScore = computeScore(input);
      const calculatedTier = getTier(calculatedScore);

      const matches =
        calculatedScore === vector.expected_score &&
        calculatedTier === vector.tier;

      return {
        id: vector.id,
        description: vector.description,
        passed: matches,
        expected: { score: vector.expected_score, tier: vector.tier },
        actual: { score: calculatedScore, tier: calculatedTier },
      };
    });

    const failed = results.filter((r) => !r.passed);

    if (failed.length > 0) {
      console.log(`\n❌ ${failed.length} vectors failed:\n`);
      failed.forEach((f) => {
        console.log(`  ✗ ${f.id}`);
        console.log(`    Description: ${f.description}`);
        console.log(
          `    Expected: score=${f.expected.score}, tier=${f.expected.tier}`
        );
        console.log(
          `    Got:      score=${f.actual.score}, tier=${f.actual.tier}`
        );
      });
    }

    const passed = results.filter((r) => r.passed).length;
    console.log(
      `\n✓ Passed: ${passed}/${vectors.vectors.length} credit score vectors`
    );

    expect(failed).toHaveLength(
      0,
      `${failed.length} credit score vectors failed. See above for details.`
    );
  });

  it('should handle zero profile correctly', () => {
    const vector = vectors.vectors.find((v) => v.id === 'zero_profile');
    expect(vector).toBeDefined();

    if (vector) {
      const accountAgeDays = accountAgeSecondsToDays(
        vector.inputs.account_age_seconds
      );
      const input = {
        totalTipsReceived: BigInt(vector.inputs.total_tips_received_stroops),
        xFollowers: vector.inputs.x_followers,
        xEngagementAvg: vector.inputs.x_engagement_avg,
        accountAgeDays: accountAgeDays,
        streakBonus: vector.inputs.streak_bonus,
      };

      const score = computeScore(input);
      expect(score).toBe(vector.expected_score);
    }
  });

  it('should validate tier boundaries', () => {
    const tierVectors = vectors.vectors.filter((v) =>
      v.id.includes('tier_boundary')
    );

    expect(tierVectors.length).toBeGreaterThanOrEqual(4);

    tierVectors.forEach((vector) => {
      const accountAgeDays = accountAgeSecondsToDays(
        vector.inputs.account_age_seconds
      );
      const input = {
        totalTipsReceived: BigInt(vector.inputs.total_tips_received_stroops),
        xFollowers: vector.inputs.x_followers,
        xEngagementAvg: vector.inputs.x_engagement_avg,
        accountAgeDays: accountAgeDays,
        streakBonus: vector.inputs.streak_bonus,
      };

      const score = computeScore(input);
      const tier = getTier(score);

      expect(score).toBe(vector.expected_score);
      expect(tier).toBe(vector.tier);
    });
  });

  it('should validate age component tests', () => {
    const ageVectors = vectors.vectors.filter((v) => v.id.includes('age_'));

    expect(ageVectors.length).toBeGreaterThanOrEqual(5);

    ageVectors.forEach((vector) => {
      const accountAgeDays = accountAgeSecondsToDays(
        vector.inputs.account_age_seconds
      );
      const input = {
        totalTipsReceived: BigInt(vector.inputs.total_tips_received_stroops),
        xFollowers: vector.inputs.x_followers,
        xEngagementAvg: vector.inputs.x_engagement_avg,
        accountAgeDays: accountAgeDays,
        streakBonus: vector.inputs.streak_bonus,
      };

      const score = computeScore(input);
      expect(score).toBe(vector.expected_score);
    });
  });

  it('should validate tip component tests', () => {
    const tipVectors = vectors.vectors.filter(
      (v) => v.id.includes('tip') && !v.id.includes('streak')
    );

    expect(tipVectors.length).toBeGreaterThanOrEqual(3);

    tipVectors.forEach((vector) => {
      const accountAgeDays = accountAgeSecondsToDays(
        vector.inputs.account_age_seconds
      );
      const input = {
        totalTipsReceived: BigInt(vector.inputs.total_tips_received_stroops),
        xFollowers: vector.inputs.x_followers,
        xEngagementAvg: vector.inputs.x_engagement_avg,
        accountAgeDays: accountAgeDays,
        streakBonus: vector.inputs.streak_bonus,
      };

      const score = computeScore(input);
      expect(score).toBe(vector.expected_score);
    });
  });

  it('should validate X component tests', () => {
    const xVectors = vectors.vectors.filter((v) => v.id.includes('x_'));

    expect(xVectors.length).toBeGreaterThanOrEqual(5);

    xVectors.forEach((vector) => {
      const accountAgeDays = accountAgeSecondsToDays(
        vector.inputs.account_age_seconds
      );
      const input = {
        totalTipsReceived: BigInt(vector.inputs.total_tips_received_stroops),
        xFollowers: vector.inputs.x_followers,
        xEngagementAvg: vector.inputs.x_engagement_avg,
        accountAgeDays: accountAgeDays,
        streakBonus: vector.inputs.streak_bonus,
      };

      const score = computeScore(input);
      expect(score).toBe(vector.expected_score);
    });
  });

  it('should validate streak component tests', () => {
    const streakVectors = vectors.vectors.filter((v) =>
      v.id.includes('streak')
    );

    expect(streakVectors.length).toBeGreaterThanOrEqual(2);

    streakVectors.forEach((vector) => {
      const accountAgeDays = accountAgeSecondsToDays(
        vector.inputs.account_age_seconds
      );
      const input = {
        totalTipsReceived: BigInt(vector.inputs.total_tips_received_stroops),
        xFollowers: vector.inputs.x_followers,
        xEngagementAvg: vector.inputs.x_engagement_avg,
        accountAgeDays: accountAgeDays,
        streakBonus: vector.inputs.streak_bonus,
      };

      const score = computeScore(input);
      expect(score).toBe(vector.expected_score);
    });
  });

  it('should validate realistic profile tests', () => {
    const realisticVectors = vectors.vectors.filter((v) =>
      v.id.includes('realistic_creator')
    );

    expect(realisticVectors.length).toBeGreaterThanOrEqual(3);

    realisticVectors.forEach((vector) => {
      const accountAgeDays = accountAgeSecondsToDays(
        vector.inputs.account_age_seconds
      );
      const input = {
        totalTipsReceived: BigInt(vector.inputs.total_tips_received_stroops),
        xFollowers: vector.inputs.x_followers,
        xEngagementAvg: vector.inputs.x_engagement_avg,
        accountAgeDays: accountAgeDays,
        streakBonus: vector.inputs.streak_bonus,
      };

      const score = computeScore(input);
      const tier = getTier(score);

      expect(score).toBe(vector.expected_score);
      expect(tier).toBe(vector.tier);
    });
  });

  it('should validate precision and edge cases', () => {
    const edgeVectors = vectors.vectors.filter((v) =>
      v.id.includes('precision') || v.id.includes('overflow')
    );

    expect(edgeVectors.length).toBeGreaterThanOrEqual(2);

    edgeVectors.forEach((vector) => {
      const accountAgeDays = accountAgeSecondsToDays(
        vector.inputs.account_age_seconds
      );
      const input = {
        totalTipsReceived: BigInt(vector.inputs.total_tips_received_stroops),
        xFollowers: vector.inputs.x_followers,
        xEngagementAvg: vector.inputs.x_engagement_avg,
        accountAgeDays: accountAgeDays,
        streakBonus: vector.inputs.streak_bonus,
      };

      const score = computeScore(input);
      expect(score).toBe(vector.expected_score);
    });
  });
});
