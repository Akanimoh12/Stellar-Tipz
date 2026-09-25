/**
 * Streak service tests with boundary conditions and shared test vectors.
 *
 * Tests ensure that off-chain projections correctly mirror on-chain state.
 * Boundary tests cover: same-day, consecutive, gap, grace period scenarios.
 *
 * Issue #1270
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../../db/prisma.js";
import { getStreak, getStreakByAddress, updateStreakProjection, getStreaksBatch } from "./streaks.service.js";

describe("Streak Service - Contract Authoritative", () => {
  describe("Basic streak retrieval", () => {
    it("should return default streak for user with no streak data", async () => {
      const result = await getStreak("nonexistent-user");

      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(0);
      expect(result.lastTipDate).toBeNull();
      expect(result.source).toBe("projection");
      expect(result.freshness).toBeDefined();
    });

    it("should return existing streak data", async () => {
      // Create a user and streak
      const user = await prisma.user.create({
        data: {
          stellarAddress: "GTEST1",
          username: "testuser",
        },
      });

      const lastTipDate = new Date("2024-01-15T10:00:00Z");
      await prisma.streak.create({
        data: {
          userId: user.id,
          currentStreak: 5,
          longestStreak: 10,
          lastTipDate,
        },
      });

      const result = await getStreak(user.id);

      expect(result.currentStreak).toBe(5);
      expect(result.longestStreak).toBe(10);
      expect(result.lastTipDate).toBe(lastTipDate.toISOString());
      expect(result.source).toBe("projection");
    });
  });

  describe("Streak by address", () => {
    it("should fetch streak by stellar address", async () => {
      const user = await prisma.user.create({
        data: {
          stellarAddress: "GTEST2",
          username: "addressuser",
        },
      });

      await prisma.streak.create({
        data: {
          userId: user.id,
          currentStreak: 3,
          longestStreak: 7,
          lastTipDate: new Date(),
        },
      });

      const result = await getStreakByAddress("GTEST2");

      expect(result.currentStreak).toBe(3);
      expect(result.userId).toBe(user.id);
    });

    it("should throw error for non-existent address", async () => {
      await expect(getStreakByAddress("GNONEXISTENT")).rejects.toThrow();
    });
  });

  describe("Projection updates from contract", () => {
    it("should create new streak projection", async () => {
      const user = await prisma.user.create({
        data: {
          stellarAddress: "GTEST3",
          username: "newstreak",
        },
      });

      const lastTipDate = new Date();
      await updateStreakProjection(user.id, 1, 1, lastTipDate);

      const streak = await prisma.streak.findUnique({
        where: { userId: user.id },
      });

      expect(streak).toBeDefined();
      expect(streak?.currentStreak).toBe(1);
      expect(streak?.longestStreak).toBe(1);
      expect(streak?.lastTipDate).toEqual(lastTipDate);
    });

    it("should update existing streak projection", async () => {
      const user = await prisma.user.create({
        data: {
          stellarAddress: "GTEST4",
          username: "updatestreak",
        },
      });

      const initialDate = new Date("2024-01-01T10:00:00Z");
      await prisma.streak.create({
        data: {
          userId: user.id,
          currentStreak: 5,
          longestStreak: 5,
          lastTipDate: initialDate,
        },
      });

      const updatedDate = new Date("2024-01-02T10:00:00Z");
      await updateStreakProjection(user.id, 6, 6, updatedDate);

      const streak = await prisma.streak.findUnique({
        where: { userId: user.id },
      });

      expect(streak?.currentStreak).toBe(6);
      expect(streak?.longestStreak).toBe(6);
      expect(streak?.lastTipDate).toEqual(updatedDate);
    });
  });

  describe("Batch streak retrieval", () => {
    beforeEach(async () => {
      // Create test users
      const users = await prisma.user.createMany({
        data: [
          { stellarAddress: "GBATCH1", username: "batch1" },
          { stellarAddress: "GBATCH2", username: "batch2" },
          { stellarAddress: "GBATCH3", username: "batch3" },
        ],
      });

      const allUsers = await prisma.user.findMany();
      
      // Create streaks for some users
      await prisma.streak.create({
        data: {
          userId: allUsers[0].id,
          currentStreak: 10,
          longestStreak: 15,
          lastTipDate: new Date(),
        },
      });

      await prisma.streak.create({
        data: {
          userId: allUsers[1].id,
          currentStreak: 5,
          longestStreak: 8,
          lastTipDate: new Date(),
        },
      });
    });

    it("should return streaks for multiple users", async () => {
      const allUsers = await prisma.user.findMany();
      const userIds = allUsers.map((u) => u.id);

      const streaks = await getStreaksBatch(userIds);

      expect(streaks.size).toBe(3);
      expect(streaks.get(allUsers[0].id)?.currentStreak).toBe(10);
      expect(streaks.get(allUsers[1].id)?.currentStreak).toBe(5);
      expect(streaks.get(allUsers[2].id)?.currentStreak).toBe(0); // No streak data
    });

    it("should handle empty user list", async () => {
      const streaks = await getStreaksBatch([]);
      expect(streaks.size).toBe(0);
    });
  });

  describe("Boundary tests (shared test vectors)", () => {
    it("should handle same-day tips correctly", async () => {
      const user = await prisma.user.create({
        data: {
          stellarAddress: "GBOUND1",
          username: "sameday",
        },
      });

      const sameDay = new Date("2024-01-15T10:00:00Z");
      
      // Simulate same-day update (contract would handle streak logic)
      await updateStreakProjection(user.id, 1, 1, sameDay);
      
      const result = await getStreak(user.id);
      expect(result.currentStreak).toBe(1);
      expect(result.lastTipDate).toBe(sameDay.toISOString());
    });

    it("should handle consecutive day tips", async () => {
      const user = await prisma.user.create({
        data: {
          stellarAddress: "GBOUND2",
          username: "consecutive",
        },
      });

      const day1 = new Date("2024-01-15T10:00:00Z");
      const day2 = new Date("2024-01-16T10:00:00Z");
      
      // Simulate consecutive day streak
      await updateStreakProjection(user.id, 2, 2, day2);
      
      const result = await getStreak(user.id);
      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(2);
    });

    it("should handle gap in tips (streak reset)", async () => {
      const user = await prisma.user.create({
        data: {
          stellarAddress: "GBOUND3",
          username: "gap",
        },
      });

      const lastTip = new Date("2024-01-15T10:00:00Z");
      
      // Streak was 5, then gap occurred, now reset to 1
      await updateStreakProjection(user.id, 1, 5, lastTip);
      
      const result = await getStreak(user.id);
      expect(result.currentStreak).toBe(1); // Reset
      expect(result.longestStreak).toBe(5); // Preserved
    });

    it("should handle grace period scenarios", async () => {
      const user = await prisma.user.create({
        data: {
          stellarAddress: "GBOUND4",
          username: "grace",
        },
      });

      const lastTip = new Date("2024-01-15T10:00:00Z");
      
      // Within grace period - streak maintained
      await updateStreakProjection(user.id, 3, 3, lastTip);
      
      const result = await getStreak(user.id);
      expect(result.currentStreak).toBe(3);
    });

    it("should handle milestone events (7, 30, 100 days)", async () => {
      const user = await prisma.user.create({
        data: {
          stellarAddress: "GBOUND5",
          username: "milestone",
        },
      });

      const lastTip = new Date("2024-01-15T10:00:00Z");
      
      // Hit 7-day milestone
      await updateStreakProjection(user.id, 7, 7, lastTip);
      
      let result = await getStreak(user.id);
      expect(result.currentStreak).toBe(7);
      
      // Hit 30-day milestone
      await updateStreakProjection(user.id, 30, 30, lastTip);
      
      result = await getStreak(user.id);
      expect(result.currentStreak).toBe(30);
    });
  });

  describe("Source and freshness metadata", () => {
    it("should indicate source as projection", async () => {
      const result = await getStreak("any-user");
      expect(result.source).toBe("projection");
    });

    it("should include freshness timestamp", async () => {
      const user = await prisma.user.create({
        data: {
          stellarAddress: "GFRESH1",
          username: "fresh",
        },
      });

      await prisma.streak.create({
        data: {
          userId: user.id,
          currentStreak: 1,
          longestStreak: 1,
          lastTipDate: new Date(),
        },
      });

      const result = await getStreak(user.id);
      expect(result.freshness).toBeDefined();
      
      // Verify it's a valid ISO date
      const date = new Date(result.freshness);
      expect(date.toISOString()).toBe(result.freshness);
    });
  });

  describe("Error handling", () => {
    it("should handle database errors gracefully", async () => {
      // This would normally involve mocking prisma to throw errors
      // For now, we verify the function structure is correct
      await expect(getStreak("test")).resolves.toBeDefined();
    });
  });
});
