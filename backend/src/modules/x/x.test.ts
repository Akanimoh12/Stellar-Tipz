import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { prisma } from "../../db/prisma.js";
import {
  fetchXMetrics,
  getCachedXMetrics,
  clearCachedXMetrics,
} from "./x.service.js";
import {
  ServiceUnavailableError,
  NotFoundError,
} from "../../common/errors/AppError.js";

// Mock fixtures
const mockXApiResponse = {
  data: {
    id: "123456789",
    name: "John Doe",
    username: "johndoe",
    public_metrics: {
      followers_count: 10000,
      following_count: 500,
      tweet_count: 5000,
      listed_count: 100,
    },
  },
};

const mockXApiResponseLowActivity = {
  data: {
    id: "987654321",
    name: "Jane Smith",
    username: "janesmith",
    public_metrics: {
      followers_count: 1000,
      following_count: 200,
      tweet_count: 100,
      listed_count: 10,
    },
  },
};

// Mock global fetch
const mockFetch = vi.fn();
(globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

describe("X Integration Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env for testing
    process.env.X_API_BEARER_TOKEN = "mock-bearer-token";
    process.env.X_API_BASE_URL = "https://api.twitter.com/2";
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.xAccount.deleteMany({});
  });

  describe("fetchXMetrics", () => {
    it("should fetch and cache fresh metrics from X API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockXApiResponse,
      });

      const metrics = await fetchXMetrics("johndoe");

      expect(metrics).toMatchObject({
        handle: "johndoe",
        followers: 10000,
      });
      expect(metrics.engagement).toBeCloseTo(0.5, 2); // 5000 tweets / 10000 followers
      expect(metrics.fetchedAt).toBeInstanceOf(Date);

      // Verify it was cached
      const cached = await prisma.xAccount.findUnique({
        where: { handle: "johndoe" },
      });
      expect(cached).toBeTruthy();
      expect(cached?.followers).toBe(10000);
    });

    it("should calculate engagement correctly for low activity accounts", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockXApiResponseLowActivity,
      });

      const metrics = await fetchXMetrics("janesmith");

      expect(metrics.engagement).toBeCloseTo(0.1, 2); // 100 tweets / 1000 followers
    });

    it("should handle account with zero followers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: "111",
            name: "New Account",
            username: "newaccount",
            public_metrics: {
              followers_count: 0,
              following_count: 10,
              tweet_count: 5,
              listed_count: 0,
            },
          },
        }),
      });

      const metrics = await fetchXMetrics("newaccount");

      expect(metrics.followers).toBe(0);
      expect(metrics.engagement).toBe(0);
    });

    it("should throw NotFoundError for non-existent user", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(fetchXMetrics("nonexistent")).rejects.toThrow(NotFoundError);
    });

    it("should throw ServiceUnavailableError when rate limited", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      await expect(fetchXMetrics("johndoe")).rejects.toThrow(
        ServiceUnavailableError,
      );
    });

    it("should throw ServiceUnavailableError when API is down", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      await expect(fetchXMetrics("johndoe")).rejects.toThrow(
        ServiceUnavailableError,
      );
    });

    it("should throw ServiceUnavailableError when bearer token is missing", async () => {
      delete process.env.X_API_BEARER_TOKEN;

      await expect(fetchXMetrics("johndoe")).rejects.toThrow(
        ServiceUnavailableError,
      );
    });

    it("should fallback to cached data when API is unavailable", async () => {
      // First, create cached data
      await prisma.xAccount.create({
        data: {
          handle: "johndoe",
          followers: 9500,
          engagement: 0.48,
          fetchedAt: new Date(),
        },
      });

      // Mock API failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      const metrics = await fetchXMetrics("johndoe", { useFallback: true });

      expect(metrics.handle).toBe("johndoe");
      expect(metrics.followers).toBe(9500);
      expect(metrics.engagement).toBeCloseTo(0.48, 2);
    });

    it("should not fallback when useFallback is false", async () => {
      // Create cached data
      await prisma.xAccount.create({
        data: {
          handle: "johndoe",
          followers: 9500,
          engagement: 0.48,
          fetchedAt: new Date(),
        },
      });

      // Mock API failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      await expect(
        fetchXMetrics("johndoe", { useFallback: false }),
      ).rejects.toThrow(ServiceUnavailableError);
    });

    it("should reject stale cached data when maxCacheAge is exceeded", async () => {
      // Create old cached data (2 days ago)
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await prisma.xAccount.create({
        data: {
          handle: "johndoe",
          followers: 9500,
          engagement: 0.48,
          fetchedAt: twoDaysAgo,
        },
      });

      // Mock API failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      // Set maxCacheAge to 1 day
      await expect(
        fetchXMetrics("johndoe", {
          useFallback: true,
          maxCacheAge: 24 * 60 * 60 * 1000,
        }),
      ).rejects.toThrow(ServiceUnavailableError);
    });

    it("should accept cached data within maxCacheAge", async () => {
      // Create recent cached data (1 hour ago)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      await prisma.xAccount.create({
        data: {
          handle: "johndoe",
          followers: 9500,
          engagement: 0.48,
          fetchedAt: oneHourAgo,
        },
      });

      // Mock API failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      const metrics = await fetchXMetrics("johndoe", {
        useFallback: true,
        maxCacheAge: 24 * 60 * 60 * 1000,
      });

      expect(metrics.followers).toBe(9500);
    });

    it("should update existing cached data with fresh metrics", async () => {
      // Create initial cached data
      await prisma.xAccount.create({
        data: {
          handle: "johndoe",
          followers: 9000,
          engagement: 0.45,
          fetchedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });

      // Mock fresh API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockXApiResponse,
      });

      await fetchXMetrics("johndoe");

      // Verify cache was updated
      const updated = await prisma.xAccount.findUnique({
        where: { handle: "johndoe" },
      });
      expect(updated?.followers).toBe(10000);
      expect(updated?.engagement).toBeCloseTo(0.5, 2);
    });
  });

  describe("getCachedXMetrics", () => {
    it("should return cached metrics if available", async () => {
      await prisma.xAccount.create({
        data: {
          handle: "johndoe",
          followers: 10000,
          engagement: 0.5,
          fetchedAt: new Date(),
        },
      });

      const metrics = await getCachedXMetrics("johndoe");

      expect(metrics).toMatchObject({
        handle: "johndoe",
        followers: 10000,
        engagement: 0.5,
      });
    });

    it("should return null if no cached data exists", async () => {
      const metrics = await getCachedXMetrics("nonexistent");
      expect(metrics).toBeNull();
    });

    it("should handle cached data without engagement", async () => {
      await prisma.xAccount.create({
        data: {
          handle: "johndoe",
          followers: 10000,
          engagement: null,
          fetchedAt: new Date(),
        },
      });

      const metrics = await getCachedXMetrics("johndoe");

      expect(metrics?.handle).toBe("johndoe");
      expect(metrics?.engagement).toBeUndefined();
    });
  });

  describe("clearCachedXMetrics", () => {
    it("should clear cached metrics for a handle", async () => {
      await prisma.xAccount.create({
        data: {
          handle: "johndoe",
          followers: 10000,
          engagement: 0.5,
          fetchedAt: new Date(),
        },
      });

      await clearCachedXMetrics("johndoe");

      const cached = await prisma.xAccount.findUnique({
        where: { handle: "johndoe" },
      });
      expect(cached).toBeNull();
    });

    it("should not error when clearing non-existent cache", async () => {
      await expect(clearCachedXMetrics("nonexistent")).resolves.not.toThrow();
    });
  });
});
