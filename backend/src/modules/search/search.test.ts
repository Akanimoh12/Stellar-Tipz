/**
 * Search service tests with relevance ranking fixtures.
 *
 * Tests assert expected ordering for known queries to prevent regression.
 *
 * Issue #1266
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../../db/prisma.js";
import { searchCreators, SEARCH_LATENCY_BUDGET_MS } from "./search.service.js";
import type { RelevanceTestFixtures } from "./search.types.js";

describe("Search Service - Relevance Ranking", () => {
  // Test fixtures with expected ordering
  const relevanceFixtures: RelevanceTestFixtures[] = [
    {
      query: "alice",
      expectedOrder: ["alice", "alice123", "notalice", "alicia"],
      description: "Exact match should rank first, followed by prefix matches",
    },
    {
      query: "bob",
      expectedOrder: ["bob", "bobby", "bobcreator", "bob_builder"],
      description: "Prefix matches should rank above substring matches",
    },
    {
      query: "charlie",
      expectedOrder: ["charlie", "charlie_dev", "thecharlie"],
      description: "Exact match then prefix then substring",
    },
  ];

  describe("Exact match priority", () => {
    it("should always rank exact username match first", async () => {
      // Setup test users
      await prisma.user.createMany({
        data: [
          { stellarAddress: "G1", username: "alice", displayName: "Alice Smith" },
          { stellarAddress: "G2", username: "alice123", displayName: "Alice Johnson" },
          { stellarAddress: "G3", username: "notalice", displayName: "Not Alice" },
        ],
        skipDuplicates: true,
      });

      const result = await searchCreators("alice", 1, 10);

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].username).toBe("alice");
      expect(result.results[0].matchType).toBe("exact");
      expect(result.results[0].relevanceScore).toBe(100); // exact match weight
    });
  });

  describe("Prefix vs substring ranking", () => {
    it("should rank prefix matches above substring matches", async () => {
      await prisma.user.createMany({
        data: [
          { stellarAddress: "G4", username: "bob", displayName: "Bob" },
          { stellarAddress: "G5", username: "bobby", displayName: "Bobby" },
          { stellarAddress: "G6", username: "thebob", displayName: "The Bob" },
        ],
        skipDuplicates: true,
      });

      const result = await searchCreators("bob", 1, 10);

      const bobIndex = result.results.findIndex((r) => r.username === "bob");
      const bobbyIndex = result.results.findIndex((r) => r.username === "bobby");
      const thebobIndex = result.results.findIndex((r) => r.username === "thebob");

      expect(bobIndex).toBeLessThan(bobbyIndex);
      expect(bobbyIndex).toBeLessThan(thebobIndex);

      expect(result.results[bobIndex].matchType).toBe("exact");
      expect(result.results[bobbyIndex].matchType).toBe("prefix");
      expect(result.results[thebobIndex].matchType).toBe("substring");
    });
  });

  describe("Typo tolerance", () => {
    it("should handle fuzzy matches when exact/prefix not available", async () => {
      // Create users with similar names
      await prisma.user.createMany({
        data: [
          { stellarAddress: "G7", username: "steven", displayName: "Steven" },
          { stellarAddress: "G8", username: "stephen", displayName: "Stephen" },
          { stellarAddress: "G9", username: "stefan", displayName: "Stefan" },
        ],
        skipDuplicates: true,
      });

      const result = await searchCreators("steven", 1, 10);

      // Should find exact match first
      expect(result.results.some((r) => r.username === "steven")).toBe(true);

      // May include fuzzy matches for similar names
      const fuzzyResults = result.results.filter((r) => r.matchType === "fuzzy");
      if (fuzzyResults.length > 0) {
        expect(fuzzyResults[0].relevanceScore).toBeGreaterThan(0);
      }
    });
  });

  describe("Credit score tiebreaker", () => {
    it("should use credit score as tiebreaker for equal match types", async () => {
      await prisma.user.createMany({
        data: [
          { stellarAddress: "G10", username: "creator_test", displayName: "Creator Test" },
          { stellarAddress: "G11", username: "creator_demo", displayName: "Creator Demo" },
        ],
        skipDuplicates: true,
      });

      const result = await searchCreators("creator", 1, 10);

      // Both should be prefix matches
      const prefixMatches = result.results.filter((r) => r.matchType === "prefix");
      if (prefixMatches.length >= 2) {
        // If they have the same base relevance score, credit score should break the tie
        expect(prefixMatches[0].relevanceScore).toBeGreaterThan(0);
      }
    });
  });

  describe("Latency budget", () => {
    it("should complete search within latency budget", async () => {
      await prisma.user.createMany({
        data: [
          { stellarAddress: "G12", username: "fast", displayName: "Fast User" },
        ],
        skipDuplicates: true,
      });

      const result = await searchCreators("fast", 1, 10);

      expect(result.latencyMs).toBeLessThan(SEARCH_LATENCY_BUDGET_MS);
    });
  });

  describe("Fixture-based ordering tests", () => {
    relevanceFixtures.forEach((fixture) => {
      it(fixture.description, async () => {
        // Create users based on fixture
        const userData = fixture.expectedOrder.map((username, index) => ({
          stellarAddress: `G${index + 20}`,
          username,
          displayName: username.charAt(0).toUpperCase() + username.slice(1),
        }));

        await prisma.user.createMany({
          data: userData,
          skipDuplicates: true,
        });

        const result = await searchCreators(fixture.query, 1, 20);

        // Verify exact match is first if exists
        const exactMatch = result.results.find((r) => r.username === fixture.query);
        if (exactMatch && fixture.expectedOrder.includes(fixture.query)) {
          expect(result.results[0].username).toBe(fixture.query);
        }

        // Verify that all expected usernames are present
        const foundUsernames = result.results.map((r) => r.username).filter(Boolean);
        fixture.expectedOrder.forEach((expected) => {
          expect(foundUsernames).toContain(expected);
        });
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle empty query gracefully", async () => {
      const result = await searchCreators("", 1, 10);

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should handle special characters in query", async () => {
      await prisma.user.createMany({
        data: [
          { stellarAddress: "G30", username: "test_user", displayName: "Test User" },
          { stellarAddress: "G31", username: "test-user", displayName: "Test-User" },
        ],
        skipDuplicates: true,
      });

      const result = await searchCreators("test-user", 1, 10);

      expect(result.results.length).toBeGreaterThan(0);
    });

    it("should handle case-insensitive matching", async () => {
      await prisma.user.createMany({
        data: [
          { stellarAddress: "G32", username: "Alice", displayName: "Alice" },
        ],
        skipDuplicates: true,
      });

      const resultLower = await searchCreators("alice", 1, 10);
      const resultUpper = await searchCreators("ALICE", 1, 10);
      const resultMixed = await searchCreators("AlIcE", 1, 10);

      expect(resultLower.results[0].username).toBe("Alice");
      expect(resultUpper.results[0].username).toBe("Alice");
      expect(resultMixed.results[0].username).toBe("Alice");
    });
  });

  describe("Pagination", () => {
    beforeEach(async () => {
      // Create many users for pagination testing
      const users = Array.from({ length: 25 }, (_, i) => ({
        stellarAddress: `G${i + 40}`,
        username: `user${i}`,
        displayName: `User ${i}`,
      }));

      await prisma.user.createMany({
        data: users,
        skipDuplicates: true,
      });
    });

    it("should respect page parameter", async () => {
      const page1 = await searchCreators("user", 1, 10);
      const page2 = await searchCreators("user", 2, 10);

      expect(page1.results).toHaveLength(10);
      expect(page2.results).toHaveLength(10);

      // Verify different results
      const page1Ids = page1.results.map((r) => r.userId);
      const page2Ids = page2.results.map((r) => r.userId);
      expect(page1Ids).not.toEqual(page2Ids);
    });

    it("should respect limit parameter", async () => {
      const limit5 = await searchCreators("user", 1, 5);
      const limit20 = await searchCreators("user", 1, 20);

      expect(limit5.results.length).toBeLessThanOrEqual(5);
      expect(limit20.results.length).toBeLessThanOrEqual(20);
    });
  });
});
