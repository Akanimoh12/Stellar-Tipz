/**
 * Tests for X integration service (issues #1294, #1293).
 * Tests proof verification, quota tracking, and graceful degradation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/config/index.js", () => ({
  config: {
    twitter: {
      bearerToken: "test-token",
      baseUrl: "https://api.twitter.com/2",
    },
  },
}));

vi.mock("@/db/prisma.js", () => ({
  prisma: {
    xLink: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    xAccount: {
      findUnique: vi.fn(),
    },
    xQuotaMetric: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/common/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  linkXAccount,
  unlinkXAccount,
  verifyOwnership,
  getXMetrics,
  getFallbackXData,
  trackQuotaUsage,
  isQuotaExhausted,
} from "./x.service.js";
import { prisma } from "@/db/prisma.js";

describe("X Integration Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("linkXAccount", () => {
    it("links X account with valid proof", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user_01",
        stellarAddress: "GABC123",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: "twitter_123" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ text: "nonce_abc123xyz" }],
          }),
        });

      vi.mocked(prisma.xLink.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      vi.mocked(prisma.xLink.create).mockResolvedValueOnce({} as any);

      const result = await linkXAccount("user_01", {
        xHandle: "testuser",
        proofType: "post_nonce",
        proofData: "nonce_abc123xyz",
      });

      expect(result.linkedAt).toBeDefined();
      expect(prisma.xLink.create).toHaveBeenCalled();
    });

    it("rejects if X handle already linked to different user", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user_01",
        stellarAddress: "GABC123",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: "twitter_123" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ text: "nonce_xyz" }],
          }),
        });

      vi.mocked(prisma.xLink.findFirst).mockResolvedValueOnce({
        id: "link_99",
        userId: "user_02",
        xHandle: "testuser",
      } as any);

      await expect(
        linkXAccount("user_01", {
          xHandle: "testuser",
          proofType: "post_nonce",
          proofData: "nonce_xyz",
        }),
      ).rejects.toThrow("already linked to another");
    });

    it("rejects if user already has different X link", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user_01",
        stellarAddress: "GABC123",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: "twitter_123" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ text: "nonce_xyz" }],
          }),
        });

      vi.mocked(prisma.xLink.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "link_01",
          userId: "user_01",
          xHandle: "olduser",
        } as any);

      await expect(
        linkXAccount("user_01", {
          xHandle: "testuser",
          proofType: "post_nonce",
          proofData: "nonce_xyz",
        }),
      ).rejects.toThrow("already have an X account linked");
    });

    it("rejects proof verification failure", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user_01",
        stellarAddress: "GABC123",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: "twitter_123" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ text: "wrong nonce" }],
          }),
        });

      vi.mocked(prisma.xLink.findFirst).mockResolvedValueOnce(null);

      await expect(
        linkXAccount("user_01", {
          xHandle: "testuser",
          proofType: "post_nonce",
          proofData: "nonce_xyz",
        }),
      ).rejects.toThrow("verify X account ownership");
    });
  });

  describe("unlinkXAccount", () => {
    it("unlinks X account and logs event", async () => {
      vi.mocked(prisma.xLink.findFirst).mockResolvedValueOnce({
        id: "link_01",
        userId: "user_01",
        xHandle: "testuser",
        unlinkedAt: null,
      } as any);

      vi.mocked(prisma.xLink.update).mockResolvedValueOnce({} as any);

      await unlinkXAccount("user_01");

      expect(prisma.xLink.update).toHaveBeenCalledWith({
        where: { id: "link_01" },
        data: { unlinkedAt: expect.any(Date) },
      });
    });

    it("throws if no X account linked", async () => {
      vi.mocked(prisma.xLink.findFirst).mockResolvedValueOnce(null);

      await expect(unlinkXAccount("user_01")).rejects.toThrow("not found");
    });
  });

  describe("verifyOwnership", () => {
    it("verifies OAuth proof", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: "twitter_123" } }),
        });

      const result = await verifyOwnership("testuser", "oauth_code", "oauth");

      expect(result).toBe(true);
    });

    it("verifies nonce proof", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: "twitter_123" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ text: "Check out nonce_xyz123" }],
          }),
        });

      const result = await verifyOwnership(
        "testuser",
        "nonce_xyz123",
        "post_nonce",
      );

      expect(result).toBe(true);
    });

    it("rejects invalid proof type", async () => {
      const result = await verifyOwnership(
        "testuser",
        "data",
        "invalid_type",
      );

      expect(result).toBe(false);
    });
  });

  describe("getXMetrics", () => {
    it("fetches metrics from API", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: "twitter_123" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              public_metrics: {
                followers_count: 10000,
                like_count: 5000,
                retweet_count: 1000,
                reply_count: 500,
                tweet_count: 500,
              },
            },
          }),
        });

      vi.mocked(prisma.xQuotaMetric.create).mockResolvedValueOnce({} as any);

      const metrics = await getXMetrics("testuser");

      expect(metrics.followers).toBe(10000);
      expect(metrics.isQuotaExhausted).toBe(false);
    });

    it("falls back to cached data on API failure", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: "twitter_123" } }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
        });

      vi.mocked(prisma.xAccount.findUnique).mockResolvedValueOnce({
        handle: "testuser",
        followers: 5000,
        fetchedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      } as any);

      const metrics = await getXMetrics("testuser");

      expect(metrics.followers).toBe(5000);
      expect(metrics.isStale).toBe(true);
      expect(metrics.isQuotaExhausted).toBe(true);
    });
  });

  describe("getFallbackXData", () => {
    it("returns cached data with age", async () => {
      const cachedDate = new Date(Date.now() - 2 * 60 * 60 * 1000);

      vi.mocked(prisma.xAccount.findUnique).mockResolvedValueOnce({
        handle: "testuser",
        followers: 5000,
        fetchedAt: cachedDate,
      } as any);

      const data = await getFallbackXData("testuser");

      expect(data.followers).toBe(5000);
      expect(data.isStale).toBe(true);
      expect(data.staleAge).toBeGreaterThan(0);
    });

    it("returns zeros if no cached data", async () => {
      vi.mocked(prisma.xAccount.findUnique).mockResolvedValueOnce(null);

      const data = await getFallbackXData("unknown");

      expect(data.followers).toBe(0);
      expect(data.fetchedAt).toBeDefined();
    });
  });

  describe("trackQuotaUsage", () => {
    it("creates quota metric record", async () => {
      vi.mocked(prisma.xQuotaMetric.create).mockResolvedValueOnce({} as any);

      const resetAt = new Date(Date.now() + 15 * 60 * 1000);
      await trackQuotaUsage(100, 350, resetAt);

      expect(prisma.xQuotaMetric.create).toHaveBeenCalledWith({
        data: {
          requestsUsed: 100,
          requestsLimit: 450,
          resetAt,
        },
      });
    });
  });

  describe("isQuotaExhausted", () => {
    it("returns true when quota > 95%", async () => {
      const resetAt = new Date(Date.now() + 5 * 60 * 1000);

      vi.mocked(prisma.xQuotaMetric.findFirst).mockResolvedValueOnce({
        requestsUsed: 450,
        requestsLimit: 450,
        resetAt,
      } as any);

      const result = await isQuotaExhausted();

      expect(result).toBe(true);
    });

    it("returns false when quota < 95%", async () => {
      const resetAt = new Date(Date.now() + 5 * 60 * 1000);

      vi.mocked(prisma.xQuotaMetric.findFirst).mockResolvedValueOnce({
        requestsUsed: 400,
        requestsLimit: 450,
        resetAt,
      } as any);

      const result = await isQuotaExhausted();

      expect(result).toBe(false);
    });

    it("returns false if quota has reset", async () => {
      const resetAt = new Date(Date.now() - 5 * 60 * 1000);

      vi.mocked(prisma.xQuotaMetric.findFirst).mockResolvedValueOnce({
        requestsUsed: 450,
        requestsLimit: 450,
        resetAt,
      } as any);

      const result = await isQuotaExhausted();

      expect(result).toBe(false);
    });
  });
});
