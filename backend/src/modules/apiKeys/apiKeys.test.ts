import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../common/utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import request from "supertest";
import express from "express";
import {
  createApiKey,
  listApiKeys,
  getApiKeyById,
  rotateApiKey,
  deleteApiKey,
  verifyApiKey,
  hashApiKeySecret,
} from "./apiKeys.service.js";
import {
  apiKeyAuthMiddleware,
  requireApiKeyScope,
  requireAnyApiKeyScope,
} from "./apiKeys.middleware.js";
import { prisma } from "../../db/prisma.js";

describe("apiKeys.service (issue #1218)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("hashApiKeySecret", () => {
    it("returns a SHA-256 hex digest", () => {
      const hash = hashApiKeySecret("my-secret");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic", () => {
      expect(hashApiKeySecret("abc")).toBe(hashApiKeySecret("abc"));
    });
  });

  describe("createApiKey", () => {
    it("creates an API key and returns the plaintext secret once", async () => {
      const rawSecret = "secret-plaintext-123";
      const fakeKey = {
        id: "key_01",
        hashedKey: hashApiKeySecret(rawSecret),
        scopes: ["read:tips"],
        expiresAt: null,
        lastUsedAt: null,
        createdById: "user_01",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: null,
      };

      vi.mocked(prisma.apiKey.create).mockResolvedValueOnce(fakeKey as never);

      const result = await createApiKey("user_01", {
        scopes: ["read:tips"],
      });

      expect(prisma.apiKey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scopes: ["read:tips"],
          createdById: "user_01",
          hashedKey: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      });
      expect(result.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(result.scopes).toEqual(["read:tips"]);
      expect(result).not.toHaveProperty("hashedKey");
      expect(result).not.toHaveProperty("previousHashedKey");
    });

    it("passes expiresAt when provided", async () => {
      const rawSecret = "secret-plaintext-456";
      const fakeKey = {
        id: "key_02",
        hashedKey: hashApiKeySecret(rawSecret),
        scopes: ["write:tips"],
        expiresAt: new Date("2026-12-31T00:00:00Z"),
        lastUsedAt: null,
        createdById: "user_01",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(prisma.apiKey.create).mockResolvedValueOnce(fakeKey as never);

      const result = await createApiKey("user_01", {
        scopes: ["write:tips"],
        expiresAt: "2026-12-31T00:00:00Z",
      });

      expect(result.expiresAt).toBe("2026-12-31T00:00:00.000Z");
    });
  });

  describe("listApiKeys", () => {
    it("returns only non-deleted keys for the user", async () => {
      vi.mocked(prisma.apiKey.findMany).mockResolvedValueOnce([
        {
          id: "key_01",
          scopes: ["read:tips"],
          expiresAt: null,
          lastUsedAt: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ] as never);

      const result = await listApiKeys("user_01");

      expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { createdById: "user_01", deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("hashedKey");
    });
  });

  describe("getApiKeyById", () => {
    it("returns the key when owned by the user", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce({
        id: "key_01",
        createdById: "user_01",
        scopes: ["read:tips"],
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: null,
      } as never);

      const result = await getApiKeyById("user_01", "key_01");
      expect(result.id).toBe("key_01");
    });

    it("throws NotFoundError for missing key", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce(null);

      await expect(getApiKeyById("user_01", "ghost")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("throws NotFoundError for soft-deleted key", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce({
        id: "key_01",
        deletedAt: new Date(),
      } as never);

      await expect(getApiKeyById("user_01", "key_01")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("throws ForbiddenError when key belongs to another user", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce({
        id: "key_01",
        createdById: "other_user",
        scopes: [],
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as never);

      await expect(getApiKeyById("user_01", "key_01")).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe("rotateApiKey", () => {
    it("rotates the key and returns a new secret with grace period", async () => {
      const existing = {
        id: "key_01",
        hashedKey: hashApiKeySecret("old-secret"),
        scopes: ["read:tips"],
        expiresAt: null,
        lastUsedAt: null,
        createdById: "user_01",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        previousHashedKey: null,
        previousGraceExpiresAt: null,
      };

      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce(existing as never);
      vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({
        ...existing,
        hashedKey: "new_hash",
        previousHashedKey: existing.hashedKey,
        previousGraceExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      } as never);

      const result = await rotateApiKey("user_01", "key_01", {
        gracePeriodMinutes: 60,
      });

      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: "key_01" },
        data: expect.objectContaining({
          hashedKey: expect.stringMatching(/^[0-9a-f]{64}$/),
          previousHashedKey: existing.hashedKey,
          previousGraceExpiresAt: expect.any(Date),
        }),
      });
      expect(result.secret).toBeDefined();
      expect(result.graceExpiresAt).toBeDefined();
    });

    it("uses default grace period of 60 minutes", async () => {
      const existing = {
        id: "key_01",
        hashedKey: "old_hash",
        scopes: ["read:tips"],
        expiresAt: null,
        lastUsedAt: null,
        createdById: "user_01",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        previousHashedKey: null,
        previousGraceExpiresAt: null,
      };

      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce(existing as never);
      vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({
        ...existing,
        hashedKey: "new_hash",
        previousHashedKey: "old_hash",
        previousGraceExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      } as never);

      await rotateApiKey("user_01", "key_01", {});

      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: "key_01" },
        data: expect.objectContaining({
          previousGraceExpiresAt: expect.any(Date),
        }),
      });

      const calledWith = vi.mocked(prisma.apiKey.update).mock.calls[0][0];
      const graceMinutes =
        (calledWith.data.previousGraceExpiresAt.getTime() - Date.now()) /
        (60 * 1000);
      expect(graceMinutes).toBeGreaterThanOrEqual(59);
      expect(graceMinutes).toBeLessThanOrEqual(61);
    });

    it("throws NotFoundError for missing key", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce(null);

      await expect(rotateApiKey("user_01", "ghost", {})).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("throws ForbiddenError when key belongs to another user", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce({
        id: "key_01",
        createdById: "other_user",
        deletedAt: null,
      } as never);

      await expect(rotateApiKey("user_01", "key_01", {})).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe("deleteApiKey", () => {
    it("soft-deletes the key", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce({
        id: "key_01",
        createdById: "user_01",
        deletedAt: null,
      } as never);
      vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({} as never);

      await deleteApiKey("user_01", "key_01");

      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: "key_01" },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it("throws NotFoundError for missing key", async () => {
      vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce(null);

      await expect(deleteApiKey("user_01", "ghost")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("verifyApiKey", () => {
    it("returns the key and updates lastUsedAt for a valid current key", async () => {
      const now = new Date();
      const fakeKey = {
        id: "key_01",
        hashedKey: hashApiKeySecret("valid-secret"),
        scopes: ["read:tips"],
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: null,
      };

      vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(fakeKey as never);
      vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({
        ...fakeKey,
        lastUsedAt: now,
      } as never);

      const result = await verifyApiKey("valid-secret");

      expect(result.id).toBe("key_01");
      expect(result.lastUsedAt).toBeDefined();
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: "key_01" },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it("accepts the previous key within the grace period", async () => {
      const graceExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const fakeKey = {
        id: "key_01",
        hashedKey: hashApiKeySecret("new-secret"),
        previousHashedKey: hashApiKeySecret("old-secret"),
        previousGraceExpiresAt: graceExpiresAt,
        scopes: ["read:tips"],
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: null,
      };

      vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(null as never);
      vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(fakeKey as never);
      vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({
        ...fakeKey,
        lastUsedAt: new Date(),
      } as never);

      const result = await verifyApiKey("old-secret");

      expect(result.id).toBe("key_01");
    });

    it("rejects the previous key after grace period expires", async () => {
      vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(null);

      await expect(verifyApiKey("expired-grace-secret")).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it("rejects invalid secrets", async () => {
      vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(null);

      await expect(verifyApiKey("totally-invalid")).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it("rejects soft-deleted keys", async () => {
      vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(null);

      await expect(verifyApiKey("deleted-secret")).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });
});

describe("apiKeys.middleware scope enforcement (issue #1218)", () => {
  const app = express();
  app.use(express.json());

  app.use(
    apiKeyAuthMiddleware,
    (req: express.Request, res: express.Response) => {
      res.json({ apiKey: req.apiKey ?? null });
    },
  );

  const scopedApp = express();
  scopedApp.use(express.json());
  scopedApp.use(
    apiKeyAuthMiddleware,
    requireApiKeyScope("read:data"),
    (_req: express.Request, res: express.Response) => {
      res.json({ ok: true });
    },
  );

  const anyScopeApp = express();
  anyScopeApp.use(express.json());
  anyScopeApp.use(
    apiKeyAuthMiddleware,
    requireAnyApiKeyScope("read:data", "write:data"),
    (_req: express.Request, res: express.Response) => {
      res.json({ ok: true });
    },
  );

  beforeEach(() => vi.clearAllMocks());

  it("attaches req.apiKey for a valid API key", async () => {
    const fakeKey = {
      id: "key_01",
      hashedKey: hashApiKeySecret("valid-secret"),
      scopes: ["read:tips"],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
    };

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(fakeKey as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({
      ...fakeKey,
      lastUsedAt: new Date(),
    } as never);

    const res = await request(app)
      .get("/")
      .set("Authorization", "ApiKey valid-secret");

    expect(res.status).toBe(200);
    expect(res.body.apiKey.id).toBe("key_01");
    expect(res.body.apiKey.scopes).toEqual(["read:tips"]);
  });

  it("rejects missing API key", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(401);
  });

  it("rejects invalid API key", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(null);

    const res = await request(app)
      .get("/")
      .set("Authorization", "ApiKey invalid-secret");

    expect(res.status).toBe(401);
  });

  it("requireApiKeyScope grants access when scope is present", async () => {
    const fakeKey = {
      id: "key_01",
      hashedKey: hashApiKeySecret("valid-secret"),
      scopes: ["read:data", "write:data"],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
    };

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(fakeKey as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({
      ...fakeKey,
      lastUsedAt: new Date(),
    } as never);

    const res = await request(scopedApp)
      .get("/")
      .set("Authorization", "ApiKey valid-secret");

    expect(res.status).toBe(200);
  });

  it("requireApiKeyScope denies access when scope is missing", async () => {
    const fakeKey = {
      id: "key_01",
      hashedKey: hashApiKeySecret("valid-secret"),
      scopes: ["other:scope"],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
    };

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(fakeKey as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({
      ...fakeKey,
      lastUsedAt: new Date(),
    } as never);

    const res = await request(scopedApp)
      .get("/")
      .set("Authorization", "ApiKey valid-secret");

    expect(res.status).toBe(403);
  });

  it("requireAnyApiKeyScope grants access when any scope is present", async () => {
    const fakeKey = {
      id: "key_01",
      hashedKey: hashApiKeySecret("valid-secret"),
      scopes: ["read:data"],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
    };

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(fakeKey as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({
      ...fakeKey,
      lastUsedAt: new Date(),
    } as never);

    const res = await request(anyScopeApp)
      .get("/")
      .set("Authorization", "ApiKey valid-secret");

    expect(res.status).toBe(200);
  });

  it("requireAnyApiKeyScope denies access when no scope matches", async () => {
    const fakeKey = {
      id: "key_01",
      hashedKey: hashApiKeySecret("valid-secret"),
      scopes: ["unrelated:scope"],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
    };

    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(fakeKey as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValueOnce({
      ...fakeKey,
      lastUsedAt: new Date(),
    } as never);

    const res = await request(anyScopeApp)
      .get("/")
      .set("Authorization", "ApiKey valid-secret");

    expect(res.status).toBe(403);
  });
});
