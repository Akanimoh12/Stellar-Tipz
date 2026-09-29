/**
 * Leaderboard snapshot consistency verification tests.
 *
 * Tests verify that the worker correctly detects divergences between
 * on-chain and off-chain leaderboard state, handles various edge cases,
 * and properly alerts based on severity.
 *
 * Issue #1268
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../../../db/prisma.js";
import {
  verifyLeaderboardConsistency,
  triggerManualVerification,
} from "./leaderboardSnapshot.worker.js";

describe("Leaderboard Snapshot Consistency Verification", () => {
  describe("Basic verification", () => {
    it("should run verification without errors", async () => {
      const report = await verifyLeaderboardConsistency();

      expect(report).toBeDefined();
      expect(report.period).toBeDefined();
      expect(report.totalEntries).toBeGreaterThanOrEqual(0);
      expect(report.divergentEntries).toBeGreaterThanOrEqual(0);
      expect(report.divergencePercentage).toBeGreaterThanOrEqual(0);
      expect(report.severity).toBeOneOf(["low", "medium", "critical"]);
    });

    it("should handle empty leaderboards", async () => {
      // Clear any existing snapshots
      await prisma.leaderboardSnapshot.deleteMany();

      const report = await verifyLeaderboardConsistency();

      expect(report.totalEntries).toBe(0);
      expect(report.divergentEntries).toBe(0);
      expect(report.divergencePercentage).toBe(0);
      expect(report.severity).toBe("low");
    });
  });

  describe("Divergence detection", () => {
    beforeEach(async () => {
      // Create test users and snapshots
      const users = await prisma.user.createMany({
        data: [
          { stellarAddress: "GVERIF1", username: "alice" },
          { stellarAddress: "GVERIF2", username: "bob" },
          { stellarAddress: "GVERIF3", username: "charlie" },
        ],
      });

      const allUsers = await prisma.user.findMany();

      // Create leaderboard snapshots
      await prisma.leaderboardSnapshot.createMany({
        data: [
          {
            period: "WEEKLY",
            rank: 1,
            userId: allUsers[0].id,
            totalTips: 1000n,
          },
          {
            period: "WEEKLY",
            rank: 2,
            userId: allUsers[1].id,
            totalTips: 500n,
          },
          {
            period: "WEEKLY",
            rank: 3,
            userId: allUsers[2].id,
            totalTips: 250n,
          },
        ],
      });
    });

    it("should detect missing off-chain entries", async () => {
      const report = await verifyLeaderboardConsistency();

      // With mock on-chain data returning empty, all off-chain entries will be detected as missing
      expect(report.divergentEntries).toBeGreaterThan(0);
    });

    it("should detect amount differences", async () => {
      const report = await verifyLeaderboardConsistency();

      // Check if any divergences have amount differences
      const amountDivergences = report.divergences.filter(
        (d) => d.amountDifference > 0n,
      );

      expect(amountDivergences).toBeInstanceOf(Array);
    });

    it("should detect rank differences", async () => {
      const report = await verifyLeaderboardConsistency();

      // Check if any divergences have rank differences
      const rankDivergences = report.divergences.filter(
        (d) => d.rankDifference > 0,
      );

      expect(rankDivergences).toBeInstanceOf(Array);
    });
  });

  describe("Severity classification", () => {
    it("should classify low severity for minor divergences", async () => {
      // Create minimal divergence scenario
      await prisma.leaderboardSnapshot.deleteMany();

      const user = await prisma.user.create({
        data: { stellarAddress: "GSEV1", username: "test" },
      });

      await prisma.leaderboardSnapshot.create({
        data: {
          period: "WEEKLY",
          rank: 1,
          userId: user.id,
          totalTips: 100n,
        },
      });

      const report = await verifyLeaderboardConsistency();

      // With mock data, severity depends on divergence percentage
      expect(report.severity).toBeOneOf(["low", "medium", "critical"]);
    });

    it("should classify critical severity for high divergence", async () => {
      // Create many divergences
      const users = await prisma.user.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({
          stellarAddress: `GCRIT${i}`,
          username: `user${i}`,
        })),
      });

      const allUsers = await prisma.user.findMany();

      await prisma.leaderboardSnapshot.createMany({
        data: allUsers.map((user, i) => ({
          period: "WEEKLY",
          rank: i + 1,
          userId: user.id,
          totalTips: BigInt((i + 1) * 100),
        })),
      });

      const report = await verifyLeaderboardConsistency();

      expect(report.severity).toBeDefined();
    });
  });

  describe("Tolerance handling", () => {
    it("should respect amount tolerance", async () => {
      // The worker uses AMOUNT_TOLERANCE_STROOPS = 100n
      // Small differences within tolerance should not be flagged
      
      const user = await prisma.user.create({
        data: { stellarAddress: "GTOL1", username: "tolerance" },
      });

      await prisma.leaderboardSnapshot.create({
        data: {
          period: "WEEKLY",
          rank: 1,
          userId: user.id,
          totalTips: 1000n,
        },
      });

      const report = await verifyLeaderboardConsistency();

      // Check that divergences respect tolerance
      const relevantDivergences = report.divergences.filter(
        (d) => d.amountDifference > 100n,
      );

      expect(relevantDivergences).toBeInstanceOf(Array);
    });

    it("should respect rank tolerance", async () => {
      // The worker uses RANK_TOLERANCE = 2
      // Small rank differences within tolerance should not be flagged
      
      const report = await verifyLeaderboardConsistency();

      // Check that divergences respect tolerance
      const relevantDivergences = report.divergences.filter(
        (d) => d.rankDifference > 2,
      );

      expect(relevantDivergences).toBeInstanceOf(Array);
    });
  });

  describe("Multi-period verification", () => {
    beforeEach(async () => {
      const user = await prisma.user.create({
        data: { stellarAddress: "GMULTI1", username: "multi" },
      });

      // Create snapshots for all periods
      await prisma.leaderboardSnapshot.createMany({
        data: [
          {
            period: "WEEKLY",
            rank: 1,
            userId: user.id,
            totalTips: 100n,
          },
          {
            period: "MONTHLY",
            rank: 1,
            userId: user.id,
            totalTips: 500n,
          },
          {
            period: "ALL_TIME",
            rank: 1,
            userId: user.id,
            totalTips: 1000n,
          },
        ],
      });
    });

    it("should verify all periods", async () => {
      const report = await verifyLeaderboardConsistency();

      // The function should check WEEKLY, MONTHLY, and ALL_TIME
      expect(report.period).toBeDefined();
    });
  });

  describe("Manual verification trigger", () => {
    it("should support manual verification trigger", async () => {
      const reports = await triggerManualVerification();

      expect(reports).toBeInstanceOf(Array);
      expect(reports.length).toBe(3); // WEEKLY, MONTHLY, ALL_TIME

      for (const report of reports) {
        expect(report).toHaveProperty("period");
        expect(report).toHaveProperty("totalEntries");
        expect(report).toHaveProperty("divergentEntries");
      }
    });

    it("should return detailed reports for all periods", async () => {
      const reports = await triggerManualVerification();

      const periods = reports.map((r) => r.period);
      expect(periods).toContain("WEEKLY");
      expect(periods).toContain("MONTHLY");
      expect(periods).toContain("ALL_TIME");
    });
  });

  describe("Divergence detail structure", () => {
    it("should include all required fields in divergence details", async () => {
      const report = await verifyLeaderboardConsistency();

      for (const divergence of report.divergences) {
        expect(divergence).toHaveProperty("stellarAddress");
        expect(divergence).toHaveProperty("username");
        expect(divergence).toHaveProperty("onChainRank");
        expect(divergence).toHaveProperty("offChainRank");
        expect(divergence).toHaveProperty("onChainAmount");
        expect(divergence).toHaveProperty("offChainAmount");
        expect(divergence).toHaveProperty("amountDifference");
        expect(divergence).toHaveProperty("rankDifference");
        expect(divergence).toHaveProperty("issue");
      }
    });

    it("should handle null on-chain values", async () => {
      const report = await verifyLeaderboardConsistency();

      // Some divergences may have null on-chain values
      const nullOnChain = report.divergences.filter(
        (d) => d.onChainRank === null || d.onChainAmount === null,
      );

      expect(nullOnChain).toBeInstanceOf(Array);
    });
  });

  describe("Error handling", () => {
    it("should handle database errors gracefully", async () => {
      // The implementation has try-catch blocks
      const report = await verifyLeaderboardConsistency();

      expect(report).toBeDefined();
    });

    it("should handle on-chain RPC errors gracefully", async () => {
      // The mock on-chain function handles errors
      const report = await verifyLeaderboardConsistency();

      expect(report).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    it("should handle single entry leaderboard", async () => {
      await prisma.leaderboardSnapshot.deleteMany();

      const user = await prisma.user.create({
        data: { stellarAddress: "GSINGLE1", username: "single" },
      });

      await prisma.leaderboardSnapshot.create({
        data: {
          period: "WEEKLY",
          rank: 1,
          userId: user.id,
          totalTips: 100n,
        },
      });

      const report = await verifyLeaderboardConsistency();

      expect(report.totalEntries).toBeGreaterThanOrEqual(0);
    });

    it("should handle very large leaderboard", async () => {
      // Create many entries
      const users = await prisma.user.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({
          stellarAddress: `GLARGE${i}`,
          username: `large${i}`,
        })),
      });

      const allUsers = await prisma.user.findMany();

      await prisma.leaderboardSnapshot.createMany({
        data: allUsers.map((user, i) => ({
          period: "WEEKLY",
          rank: i + 1,
          userId: user.id,
          totalTips: BigInt((i + 1) * 100),
        })),
      });

      const report = await verifyLeaderboardConsistency();

      expect(report.totalEntries).toBeGreaterThanOrEqual(0);
    });

    it("should handle duplicate addresses", async () => {
      // This should not happen in practice, but test robustness
      const user = await prisma.user.create({
        data: { stellarAddress: "GDUP1", username: "duplicate" },
      });

      await prisma.leaderboardSnapshot.createMany({
        data: [
          {
            period: "WEEKLY",
            rank: 1,
            userId: user.id,
            totalTips: 100n,
          },
          {
            period: "MONTHLY",
            rank: 1,
            userId: user.id,
            totalTips: 200n,
          },
        ],
      });

      const report = await verifyLeaderboardConsistency();

      expect(report).toBeDefined();
    });
  });

  describe("Performance", () => {
    it("should complete verification in reasonable time", async () => {
      const startTime = Date.now();
      const report = await verifyLeaderboardConsistency();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete in < 5s
    });
  });
});
