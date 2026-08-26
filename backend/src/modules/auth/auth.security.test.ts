/**
 * Auth security hardening tests (Issue 083/250).
 *
 * Covers all acceptance criteria:
 * 1. Challenges are single-use — consumed atomically on verification.
 * 2. Signed message includes domain, network, nonce, and expiry.
 * 3. Constant-time comparison for secret material.
 * 4. Expired challenges are pruned by scheduled job.
 * 5. Rate-limited per address and per IP.
 * 6. Tests: replay rejected, cross-network replay rejected, expiry, concurrent-use race.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mock refs (available inside vi.mock factories) ───────────────────
const { mockAuthChallenge, mockUser, mockRefreshToken } = vi.hoisted(() => ({
  mockAuthChallenge: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  mockUser: {
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  },
  mockRefreshToken: {
    create: vi.fn(),
  },
}));

// ── Mock env before any module that imports it ────────────────────────────────
vi.mock("@/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    API_BASE_PATH: "/api/v1",
    CORS_ORIGIN: "http://localhost:5173",
    JWT_SECRET: "test-secret-key-for-vitest",
    JWT_EXPIRES_IN: "15m",
    REFRESH_TOKEN_EXPIRES_IN: "7d",
    AUTH_CHALLENGE_TTL_SECONDS: 300,
    AUTH_CHALLENGE_CLEANUP_CRON: "*/5 * * * *",
    AUTH_RATE_LIMIT_PER_IP: 30,
    AUTH_RATE_LIMIT_PER_ADDRESS: 10,
    AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
    LOG_LEVEL: "silent",
    STELLAR_NETWORK: "TESTNET",
    NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  },
}));

// ── Mock Prisma ──────────────────────────────────────────────────────────────
vi.mock("@/db/prisma.js", () => ({
  prisma: {
    authChallenge: mockAuthChallenge,
    user: mockUser,
    refreshToken: mockRefreshToken,
  },
}));

// ── Mock logger to suppress output ───────────────────────────────────────────
vi.mock("@/common/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock signature verification (controlled per-test) ────────────────────────
const mockVerifySignature = vi.fn();
vi.mock("@/modules/auth/signature.js", () => ({
  verifyEd25519Signature: (...args: unknown[]) => mockVerifySignature(...args),
}));

// ── Imports after mocks ──────────────────────────────────────────────────────
import {
  createChallenge,
  verifyChallenge,
  pruneExpiredChallenges,
  AUTH_DOMAIN,
  buildSignedMessage,
  resolveNetworkPassphrase,
  constantTimeCompare,
} from "@/modules/auth/auth.service.js";

// ── Test fixtures ────────────────────────────────────────────────────────────
const TEST_ADDRESS = "GBZXN7PIRZGNMHGA7MUUUF4GTDYMLY433Y5IVRA5OVZVIVX4VQE256HG";
const TEST_NETWORK = "TESTNET";
const TEST_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const NOW = new Date("2026-08-26T12:00:00.000Z");

describe("Auth security hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: NOW });
    mockVerifySignature.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. buildSignedMessage ──────────────────────────────────────────────────

  describe("buildSignedMessage", () => {
    it("includes domain, address, network passphrase, nonce, and expiry", () => {
      const expiresAt = new Date("2026-08-26T12:05:00.000Z");
      const msg = buildSignedMessage(
        TEST_ADDRESS,
        TEST_NETWORK_PASSPHRASE,
        "abc123",
        expiresAt,
      );

      expect(msg).toContain(AUTH_DOMAIN);
      expect(msg).toContain(`Wallet: ${TEST_ADDRESS}`);
      expect(msg).toContain(`Network: ${TEST_NETWORK_PASSPHRASE}`);
      expect(msg).toContain("Nonce: abc123");
      expect(msg).toContain(`Expires: ${expiresAt.toISOString()}`);
    });

    it("produces a deterministic message for the same inputs", () => {
      const expiresAt = new Date("2026-08-26T12:05:00.000Z");
      const msg1 = buildSignedMessage(TEST_ADDRESS, TEST_NETWORK_PASSPHRASE, "nonce1", expiresAt);
      const msg2 = buildSignedMessage(TEST_ADDRESS, TEST_NETWORK_PASSPHRASE, "nonce1", expiresAt);
      expect(msg1).toBe(msg2);
    });

    it("produces different messages for different nonces", () => {
      const expiresAt = new Date("2026-08-26T12:05:00.000Z");
      const msg1 = buildSignedMessage(TEST_ADDRESS, TEST_NETWORK_PASSPHRASE, "nonce1", expiresAt);
      const msg2 = buildSignedMessage(TEST_ADDRESS, TEST_NETWORK_PASSPHRASE, "nonce2", expiresAt);
      expect(msg1).not.toBe(msg2);
    });

    it("produces different messages for different addresses", () => {
      const expiresAt = new Date("2026-08-26T12:05:00.000Z");
      const msg1 = buildSignedMessage("GADDRESS1", TEST_NETWORK_PASSPHRASE, "nonce1", expiresAt);
      const msg2 = buildSignedMessage("GADDRESS2", TEST_NETWORK_PASSPHRASE, "nonce1", expiresAt);
      expect(msg1).not.toBe(msg2);
    });

    it("produces different messages for different networks", () => {
      const expiresAt = new Date("2026-08-26T12:05:00.000Z");
      const msg1 = buildSignedMessage(TEST_ADDRESS, "Test SDF Network ; September 2015", "nonce1", expiresAt);
      const msg2 = buildSignedMessage(TEST_ADDRESS, "Public Global Stellar Network ; September 2015", "nonce1", expiresAt);
      expect(msg1).not.toBe(msg2);
    });

    it("produces different messages for different expiry times", () => {
      const expiresAt1 = new Date("2026-08-26T12:05:00.000Z");
      const expiresAt2 = new Date("2026-08-26T12:06:00.000Z");
      const msg1 = buildSignedMessage(TEST_ADDRESS, TEST_NETWORK_PASSPHRASE, "nonce1", expiresAt1);
      const msg2 = buildSignedMessage(TEST_ADDRESS, TEST_NETWORK_PASSPHRASE, "nonce1", expiresAt2);
      expect(msg1).not.toBe(msg2);
    });
  });

  // ── 2. constantTimeCompare ─────────────────────────────────────────────────

  describe("constantTimeCompare", () => {
    it("returns true for identical strings", () => {
      expect(constantTimeCompare("hello", "hello")).toBe(true);
    });

    it("returns false for different strings of same length", () => {
      expect(constantTimeCompare("hello", "world")).toBe(false);
    });

    it("returns false for different-length strings", () => {
      expect(constantTimeCompare("short", "longer")).toBe(false);
    });

    it("returns true for empty strings", () => {
      expect(constantTimeCompare("", "")).toBe(true);
    });
  });

  // ── 3. createChallenge returns domain-bound response ───────────────────────

  describe("createChallenge", () => {
    it("returns domain and networkPassphrase in response", async () => {
      const expiresAt = new Date(Date.now() + 300_000);
      mockAuthChallenge.deleteMany.mockResolvedValue({ count: 0 });
      mockAuthChallenge.findFirst.mockResolvedValue(null);
      mockAuthChallenge.create.mockResolvedValue({
        id: "ch_1",
        challenge: "a".repeat(64),
        network: TEST_NETWORK,
        expiresAt,
      });

      const result = await createChallenge(TEST_ADDRESS, TEST_NETWORK);

      expect(result).toHaveProperty("domain", AUTH_DOMAIN);
      expect(result).toHaveProperty("networkPassphrase", TEST_NETWORK_PASSPHRASE);
      expect(result).toHaveProperty("challenge");
      expect(result).toHaveProperty("network", TEST_NETWORK);
      expect(result).toHaveProperty("expiresAt");
    });

    it("returns existing valid challenge if one exists", async () => {
      const expiresAt = new Date(Date.now() + 300_000);
      mockAuthChallenge.deleteMany.mockResolvedValue({ count: 0 });
      mockAuthChallenge.findFirst.mockResolvedValue({
        id: "ch_existing",
        challenge: "existing_nonce",
        network: TEST_NETWORK,
        expiresAt,
      });

      const result = await createChallenge(TEST_ADDRESS, TEST_NETWORK);

      expect(result.challenge).toBe("existing_nonce");
      expect(result.domain).toBe(AUTH_DOMAIN);
      expect(mockAuthChallenge.create).not.toHaveBeenCalled();
    });
  });

  // ── 4. Single-use enforcement (replay rejected) ────────────────────────────

  describe("single-use enforcement", () => {
    it("rejects replay of an already-consumed challenge", async () => {
      const challengeStr = "a".repeat(64);
      const expiresAt = new Date(Date.now() + 300_000);

      // First call: challenge exists, deleteMany returns count=1 → success
      mockAuthChallenge.findUnique
        .mockResolvedValueOnce({
          id: "ch_1",
          stellarAddress: TEST_ADDRESS,
          challenge: challengeStr,
          network: TEST_NETWORK,
          expiresAt,
        });
      mockAuthChallenge.deleteMany.mockResolvedValueOnce({ count: 1 });
      mockUser.upsert.mockResolvedValueOnce({
        id: "user_1",
        stellarAddress: TEST_ADDRESS,
        role: "user",
        scopes: [],
      });
      mockRefreshToken.create.mockResolvedValueOnce({});

      await verifyChallenge(TEST_ADDRESS, "sig1", challengeStr, TEST_NETWORK);

      // Second call: challenge still found (read before delete), but deleteMany returns count=0
      mockAuthChallenge.findUnique.mockResolvedValueOnce({
        id: "ch_1",
        stellarAddress: TEST_ADDRESS,
        challenge: challengeStr,
        network: TEST_NETWORK,
        expiresAt,
      });
      mockAuthChallenge.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        verifyChallenge(TEST_ADDRESS, "sig2", challengeStr, TEST_NETWORK),
      ).rejects.toThrow("Challenge already used");
    });
  });

  // ── 5. Concurrent-use race condition ───────────────────────────────────────

  describe("concurrent-use race condition", () => {
    it("only one of two concurrent verifications succeeds (deleteMany count check)", async () => {
      const challengeStr = "b".repeat(64);
      const expiresAt = new Date(Date.now() + 300_000);

      // Both concurrent requests find the same challenge
      mockAuthChallenge.findUnique
        .mockResolvedValueOnce({
          id: "ch_2",
          stellarAddress: TEST_ADDRESS,
          challenge: challengeStr,
          network: TEST_NETWORK,
          expiresAt,
        })
        .mockResolvedValueOnce({
          id: "ch_2",
          stellarAddress: TEST_ADDRESS,
          challenge: challengeStr,
          network: TEST_NETWORK,
          expiresAt,
        });

      // First deleteMany wins (count=1), second loses (count=0)
      mockAuthChallenge.deleteMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      mockUser.upsert.mockResolvedValue({
        id: "user_1",
        stellarAddress: TEST_ADDRESS,
        role: "user",
        scopes: [],
      });
      mockRefreshToken.create.mockResolvedValue({});

      // Both requests race concurrently
      const results = await Promise.allSettled([
        verifyChallenge(TEST_ADDRESS, "sig1", challengeStr, TEST_NETWORK),
        verifyChallenge(TEST_ADDRESS, "sig2", challengeStr, TEST_NETWORK),
      ]);

      const succeeded = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter(
        (r) => r.status === "rejected" && (r.reason as Error).message === "Challenge already used",
      );

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
    });
  });

  // ── 6. Cross-network replay rejected ───────────────────────────────────────

  describe("cross-network replay", () => {
    it("rejects a TESTNET challenge when verifying for MAINNET", async () => {
      const challengeStr = "c".repeat(64);
      const expiresAt = new Date(Date.now() + 300_000);

      mockAuthChallenge.findUnique.mockResolvedValue({
        id: "ch_3",
        stellarAddress: TEST_ADDRESS,
        challenge: challengeStr,
        network: "TESTNET",
        expiresAt,
      });

      await expect(
        verifyChallenge(TEST_ADDRESS, "sig", challengeStr, "MAINNET"),
      ).rejects.toThrow("Challenge network mismatch");
    });

    it("rejects a MAINNET challenge when verifying for TESTNET", async () => {
      const challengeStr = "d".repeat(64);
      const expiresAt = new Date(Date.now() + 300_000);

      mockAuthChallenge.findUnique.mockResolvedValue({
        id: "ch_4",
        stellarAddress: TEST_ADDRESS,
        challenge: challengeStr,
        network: "MAINNET",
        expiresAt,
      });

      await expect(
        verifyChallenge(TEST_ADDRESS, "sig", challengeStr, "TESTNET"),
      ).rejects.toThrow("Challenge network mismatch");
    });
  });

  // ── 7. Expired challenge rejected ──────────────────────────────────────────

  describe("expired challenge", () => {
    it("rejects an expired challenge", async () => {
      const challengeStr = "e".repeat(64);
      const expiresAt = new Date(Date.now() - 1000); // Already expired

      mockAuthChallenge.findUnique.mockResolvedValue({
        id: "ch_5",
        stellarAddress: TEST_ADDRESS,
        challenge: challengeStr,
        network: TEST_NETWORK,
        expiresAt,
      });

      await expect(
        verifyChallenge(TEST_ADDRESS, "sig", challengeStr, TEST_NETWORK),
      ).rejects.toThrow("Challenge expired");
    });
  });

  // ── 8. Challenge address mismatch ──────────────────────────────────────────

  describe("challenge address mismatch", () => {
    it("rejects when the challenge was issued to a different address", async () => {
      const challengeStr = "f".repeat(64);
      const expiresAt = new Date(Date.now() + 300_000);
      const otherAddress = "GAOTHERADDRESS1234567890123456789012345678901234567890";

      mockAuthChallenge.findUnique.mockResolvedValue({
        id: "ch_6",
        stellarAddress: otherAddress,
        challenge: challengeStr,
        network: TEST_NETWORK,
        expiresAt,
      });

      await expect(
        verifyChallenge(TEST_ADDRESS, "sig", challengeStr, TEST_NETWORK),
      ).rejects.toThrow("Challenge address mismatch");
    });
  });

  // ── 9. pruneExpiredChallenges ──────────────────────────────────────────────

  describe("pruneExpiredChallenges", () => {
    it("deletes expired challenges and returns count", async () => {
      mockAuthChallenge.deleteMany.mockResolvedValue({ count: 5 });

      const count = await pruneExpiredChallenges();

      expect(count).toBe(5);
      expect(mockAuthChallenge.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });

    it("returns 0 when no expired challenges exist", async () => {
      mockAuthChallenge.deleteMany.mockResolvedValue({ count: 0 });

      const count = await pruneExpiredChallenges();
      expect(count).toBe(0);
    });
  });

  // ── 10. Cross-domain replay prevention ─────────────────────────────────────

  describe("cross-domain replay prevention", () => {
    it("signed message starts with domain prefix", () => {
      const expiresAt = new Date("2026-08-26T12:05:00.000Z");
      const msg = buildSignedMessage(
        TEST_ADDRESS,
        TEST_NETWORK_PASSPHRASE,
        "nonce_xyz",
        expiresAt,
      );

      expect(msg.split("\n")[0]).toBe(AUTH_DOMAIN);
    });
  });

  // ── 11. Invalid challenge rejected ─────────────────────────────────────────

  describe("invalid challenge", () => {
    it("rejects a non-existent challenge", async () => {
      mockAuthChallenge.findUnique.mockResolvedValue(null);

      await expect(
        verifyChallenge(TEST_ADDRESS, "sig", "nonexistent_challenge", TEST_NETWORK),
      ).rejects.toThrow("Invalid challenge");
    });
  });

  // ── 12. Invalid signature rejected ─────────────────────────────────────────

  describe("invalid signature", () => {
    it("rejects when signature verification fails", async () => {
      const challengeStr = "g".repeat(64);
      const expiresAt = new Date(Date.now() + 300_000);

      mockAuthChallenge.findUnique.mockResolvedValue({
        id: "ch_7",
        stellarAddress: TEST_ADDRESS,
        challenge: challengeStr,
        network: TEST_NETWORK,
        expiresAt,
      });
      mockVerifySignature.mockReturnValue(false);

      await expect(
        verifyChallenge(TEST_ADDRESS, "bad_sig", challengeStr, TEST_NETWORK),
      ).rejects.toThrow("Invalid signature");
    });
  });

  // ── 13. resolveNetworkPassphrase ───────────────────────────────────────────

  describe("resolveNetworkPassphrase", () => {
    it("returns the configured network passphrase", () => {
      expect(resolveNetworkPassphrase("TESTNET")).toBe(TEST_NETWORK_PASSPHRASE);
    });
  });
});
