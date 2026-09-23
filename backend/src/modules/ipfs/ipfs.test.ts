/**
 * Tests for IPFS service (issues #1295, #1296).
 * Mocks Prisma and Redis, tests core pinning, unpinning, and cleanup logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/config/index.js", () => ({
  config: {
    ipfs: {
      apiUrl: "http://localhost:5001",
      gatewayUrl: "https://ipfs.io/ipfs/",
    },
  },
}));

vi.mock("@/db/prisma.js", () => ({
  prisma: {
    upload: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/db/redis.js", () => ({
  redis: {
    lpush: vi.fn(),
    rpop: vi.fn(),
  },
}));

vi.mock("@/common/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  pinToIpfs,
  unpinFromIpfs,
  verifyPin,
  getIpfsGateway,
  findOrphanedUploads,
  dryRunCleanup,
  executeCleanup,
  verifyAllPins,
} from "./ipfs.service.js";
import { prisma } from "@/db/prisma.js";
import { redis } from "@/db/redis.js";
import { UploadStatus } from "./ipfs.types.js";

const TEST_CID = "QmRyZpQhcajZCfQMTL1pLfqL9Z7sYDqiGZFyD3xGhjXHN";

describe("IPFS Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("pinToIpfs", () => {
    it("pins valid content and returns success", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await pinToIpfs(TEST_CID, {
        userId: "user_01",
        entityType: "profile_avatar",
      });

      expect(result.success).toBe(true);
      expect(result.cid).toBe(TEST_CID);
      expect(global.fetch).toHaveBeenCalled();
    });

    it("rejects invalid CID format", async () => {
      await expect(
        pinToIpfs("invalid-cid", { userId: "user_01" }),
      ).rejects.toThrow();
    });

    it("queues retry on server error (5xx)", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      const result = await pinToIpfs(TEST_CID, { userId: "user_01" });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(redis.lpush).toHaveBeenCalled();
    });

    it("queues retry on rate limit (429)", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });

      const result = await pinToIpfs(TEST_CID, { userId: "user_01" });

      expect(result.retryable).toBe(true);
      expect(redis.lpush).toHaveBeenCalled();
    });

    it("does not retry on client error (4xx)", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      });

      const result = await pinToIpfs(TEST_CID, { userId: "user_01" });

      expect(result.retryable).toBe(false);
    });
  });

  describe("unpinFromIpfs", () => {
    it("unpins content successfully", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await expect(unpinFromIpfs(TEST_CID)).resolves.not.toThrow();
      expect(global.fetch).toHaveBeenCalled();
    });

    it("throws on unpin failure", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(unpinFromIpfs(TEST_CID)).rejects.toThrow();
    });
  });

  describe("verifyPin", () => {
    it("verifies pin exists via primary gateway", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await verifyPin(TEST_CID);

      expect(result.exists).toBe(true);
      expect(result.cid).toBe(TEST_CID);
    });

    it("falls back to secondary gateway on timeout", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

      const result = await verifyPin(TEST_CID);

      expect(result.exists).toBe(true);
    });

    it("returns false when all gateways fail", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Timeout"));

      const result = await verifyPin(TEST_CID);

      expect(result.exists).toBe(false);
    });
  });

  describe("getIpfsGateway", () => {
    it("returns primary gateway URL", () => {
      const url = getIpfsGateway(TEST_CID, 0);
      expect(url).toContain(TEST_CID);
      expect(url).toContain("ipfs.io");
    });

    it("fallbacks to valid gateway on invalid index", () => {
      const url = getIpfsGateway(TEST_CID, 999);
      expect(url).toContain(TEST_CID);
    });
  });

  describe("findOrphanedUploads", () => {
    it("finds uploads without entity reference beyond grace period", async () => {
      const cutoffDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

      vi.mocked(prisma.upload.findMany).mockResolvedValueOnce([
        {
          id: "upload_01",
          cid: TEST_CID,
          createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        },
      ]);

      const orphans = await findOrphanedUploads(30);

      expect(orphans).toHaveLength(1);
      expect(orphans[0].cid).toBe(TEST_CID);
      expect(prisma.upload.findMany).toHaveBeenCalledWith({
        where: {
          entityId: null,
          status: UploadStatus.PINNED,
          createdAt: { lt: cutoffDate },
          deletedAt: null,
        },
        select: {
          id: true,
          cid: true,
          createdAt: true,
        },
      });
    });

    it("returns empty array when no orphans exist", async () => {
      vi.mocked(prisma.upload.findMany).mockResolvedValueOnce([]);

      const orphans = await findOrphanedUploads(30);

      expect(orphans).toHaveLength(0);
    });
  });

  describe("dryRunCleanup", () => {
    it("reports what would be unpinned without deleting", async () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

      vi.mocked(prisma.upload.findMany).mockResolvedValueOnce([
        {
          id: "upload_01",
          cid: TEST_CID,
          createdAt: oldDate,
        },
      ]);

      vi.mocked(prisma.upload.findFirst).mockResolvedValueOnce(null);

      const dryRun = await dryRunCleanup(30);

      expect(dryRun).toHaveLength(1);
      expect(dryRun[0].cid).toBe(TEST_CID);
      expect(dryRun[0].referenced).toBe(false);
    });

    it("marks referenced content as safe", async () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

      vi.mocked(prisma.upload.findMany).mockResolvedValueOnce([
        {
          id: "upload_01",
          cid: TEST_CID,
          createdAt: oldDate,
        },
      ]);

      vi.mocked(prisma.upload.findFirst).mockResolvedValueOnce({
        id: "upload_02",
        cid: TEST_CID,
        status: UploadStatus.PINNED,
      });

      const dryRun = await dryRunCleanup(30);

      expect(dryRun[0].referenced).toBe(true);
    });
  });

  describe("executeCleanup", () => {
    it("unpins orphaned content", async () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

      vi.mocked(prisma.upload.findMany).mockResolvedValueOnce([
        {
          id: "upload_01",
          cid: TEST_CID,
          createdAt: oldDate,
        },
      ]);

      vi.mocked(prisma.upload.findFirst).mockResolvedValueOnce(null);
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
      vi.mocked(prisma.upload.update).mockResolvedValueOnce({} as any);

      const result = await executeCleanup(30);

      expect(result.unpinned).toBe(1);
      expect(result.skipped).toBe(0);
      expect(prisma.upload.update).toHaveBeenCalled();
    });

    it("skips cleanup if content is still referenced", async () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

      vi.mocked(prisma.upload.findMany).mockResolvedValueOnce([
        {
          id: "upload_01",
          cid: TEST_CID,
          createdAt: oldDate,
        },
      ]);

      vi.mocked(prisma.upload.findFirst).mockResolvedValueOnce({
        id: "upload_02",
        cid: TEST_CID,
        status: UploadStatus.PINNED,
      });

      const result = await executeCleanup(30);

      expect(result.unpinned).toBe(0);
      expect(result.skipped).toBe(1);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("verifyAllPins", () => {
    it("verifies all pinned uploads", async () => {
      vi.mocked(prisma.upload.findMany).mockResolvedValueOnce([
        {
          id: "upload_01",
          cid: TEST_CID,
        },
      ]);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await verifyAllPins();

      expect(result.verified).toBe(1);
      expect(result.failed).toBe(0);
    });

    it("queues failed verifications for retry", async () => {
      vi.mocked(prisma.upload.findMany).mockResolvedValueOnce([
        {
          id: "upload_01",
          cid: TEST_CID,
        },
      ]);

      global.fetch = vi.fn().mockRejectedValue(new Error("Timeout"));

      const result = await verifyAllPins();

      expect(result.verified).toBe(0);
      expect(result.failed).toBe(1);
      expect(redis.lpush).toHaveBeenCalled();
    });
  });
});
