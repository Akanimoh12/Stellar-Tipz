import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

const OLD_SECRET = "old-secret-min-16-chars-123";
const NEW_SECRET = "new-secret-min-16-chars-456";
const SINGLE_SECRET = "test-secret-key-for-vitest";

// Helper to mock env with rotation config
function mockEnv(envOverrides: Record<string, unknown>) {
  vi.doMock("@/config/env.js", () => ({ env: envOverrides }));
  vi.doMock("../../config/env.js", () => ({ env: envOverrides }));
}

describe("JWT key rotation (kid, overlapping keys)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("signing uses current kid and verification accepts set of keys", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "test",
        JWT_SECRET: OLD_SECRET,
        JWT_SECRETS: JSON.stringify({ "kid-old": OLD_SECRET, "kid-new": NEW_SECRET }),
        JWT_CURRENT_KID: "kid-new",
        JWT_EXPIRES_IN: "15m",
      },
    }));
    const { signAccessToken, verifyAccessToken, getJwtKeySet } = await import("./jwt.js");
    const payload = { userId: "u1", stellarAddress: "GABC", role: "user", scopes: [] as string[] };
    const token = signAccessToken(payload);
    const decoded = jwt.decode(token, { complete: true }) as { header: { kid?: string } };
    expect(decoded.header.kid).toBe("kid-new");

    // Should verify with kid-new
    const verified = verifyAccessToken(token);
    expect(verified.userId).toBe("u1");

    // Also verify that old key set contains both
    const { keys } = getJwtKeySet();
    expect(keys.get("kid-old")).toBe(OLD_SECRET);
    expect(keys.get("kid-new")).toBe(NEW_SECRET);
  });

  it("sign with new / verify with old (zero session loss)", async () => {
    // Phase 1: only old key
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "test",
        JWT_SECRET: OLD_SECRET,
        JWT_SECRETS: JSON.stringify({ "kid-old": OLD_SECRET }),
        JWT_CURRENT_KID: "kid-old",
        JWT_EXPIRES_IN: "15m",
      },
    }));
    let mod = await import("./jwt.js");
    const payload = { userId: "u1", stellarAddress: "GABC", role: "user", scopes: [] };
    const oldToken = mod.signAccessToken(payload);
    expect((jwt.decode(oldToken, { complete: true }) as any).header.kid).toBe("kid-old");

    // Phase 2: rotation - add new key, switch current
    vi.resetModules();
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "test",
        JWT_SECRET: OLD_SECRET,
        JWT_SECRETS: JSON.stringify({ "kid-old": OLD_SECRET, "kid-new": NEW_SECRET }),
        JWT_CURRENT_KID: "kid-new",
        JWT_EXPIRES_IN: "15m",
      },
    }));
    mod = await import("./jwt.js");
    const newToken = mod.signAccessToken(payload);
    expect((jwt.decode(newToken, { complete: true }) as any).header.kid).toBe("kid-new");

    // Both tokens must verify under new key set (zero loss)
    expect(mod.verifyAccessToken(oldToken).userId).toBe("u1");
    expect(mod.verifyAccessToken(newToken).userId).toBe("u1");
  });

  it("unknown kid rejected", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "test",
        JWT_SECRET: OLD_SECRET,
        JWT_SECRETS: JSON.stringify({ "kid-old": OLD_SECRET, "kid-new": NEW_SECRET }),
        JWT_CURRENT_KID: "kid-new",
        JWT_EXPIRES_IN: "15m",
      },
    }));
    const { verifyAccessToken } = await import("./jwt.js");
    const fake = jwt.sign({ userId: "u1", stellarAddress: "GABC", role: "user", scopes: [] }, "some-other-secret", {
      expiresIn: "15m",
      keyid: "kid-unknown",
    } as jwt.SignOptions);
    expect(() => verifyAccessToken(fake)).toThrow(/Unknown key id/);
  });

  it("rotation with live sessions: old tokens still valid after adding new key", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "test",
        JWT_SECRET: OLD_SECRET,
        JWT_SECRETS: JSON.stringify({ "kid-old": OLD_SECRET }),
        JWT_CURRENT_KID: "kid-old",
        JWT_EXPIRES_IN: "15m",
      },
    }));
    let mod = await import("./jwt.js");
    const payload = { userId: "session-user", stellarAddress: "GSESSION", role: "user", scopes: [] };
    const sessionToken = mod.signAccessToken(payload);

    // Simulate deployment with new key added but old still present
    vi.resetModules();
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "test",
        JWT_SECRET: OLD_SECRET,
        JWT_SECRETS: JSON.stringify({ "kid-old": OLD_SECRET, "kid-new": NEW_SECRET }),
        JWT_CURRENT_KID: "kid-new",
        JWT_EXPIRES_IN: "15m",
      },
    }));
    mod = await import("./jwt.js");
    // Live session token (kid-old) should still be valid
    expect(mod.verifyAccessToken(sessionToken).userId).toBe("session-user");
    // New sessions use kid-new
    const newSession = mod.signAccessToken(payload);
    expect(mod.verifyAccessToken(newSession).userId).toBe("session-user");
  });

  it("retired keys removed after window: old tokens rejected", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "test",
        JWT_SECRET: NEW_SECRET,
        JWT_SECRETS: JSON.stringify({ "kid-old": OLD_SECRET, "kid-new": NEW_SECRET }),
        JWT_CURRENT_KID: "kid-new",
        JWT_EXPIRES_IN: "15m",
      },
    }));
    let mod = await import("./jwt.js");
    const payload = { userId: "u1", stellarAddress: "GABC", role: "user", scopes: [] };
    const oldToken = mod.signWithKid(payload, "kid-old");

    // Retire old key (remove from set, update JWT_SECRET to new)
    vi.resetModules();
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "test",
        JWT_SECRET: NEW_SECRET,
        JWT_SECRETS: JSON.stringify({ "kid-new": NEW_SECRET }),
        JWT_CURRENT_KID: "kid-new",
        JWT_EXPIRES_IN: "15m",
      },
    }));
    mod = await import("./jwt.js");
    expect(() => mod.verifyAccessToken(oldToken)).toThrow(/Unknown key id/);
  });

  it("single-secret config path still works (backward compat, no JWT_SECRETS)", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "test",
        JWT_SECRET: SINGLE_SECRET,
        JWT_SECRETS: undefined,
        JWT_CURRENT_KID: undefined,
        JWT_EXPIRES_IN: "15m",
      },
    }));
    const { signAccessToken, verifyAccessToken } = await import("./jwt.js");
    const payload = { userId: "u1", stellarAddress: "GABC", role: "user", scopes: [] };
    const token = signAccessToken(payload);
    const decoded = jwt.decode(token, { complete: true }) as { header: { kid?: string } };
    expect(decoded.header.kid).toBe("primary");
    expect(verifyAccessToken(token).userId).toBe("u1");

    // Legacy token without kid (signed directly with JWT_SECRET) should also verify
    const legacy = jwt.sign(payload, SINGLE_SECRET, { expiresIn: "15m" } as jwt.SignOptions);
    expect((jwt.decode(legacy, { complete: true }) as any).header.kid).toBeUndefined();
    expect(verifyAccessToken(legacy).userId).toBe("u1");
  });

  it("CSV format for JWT_SECRETS is supported", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: {
        NODE_ENV: "test",
        JWT_SECRET: OLD_SECRET,
        JWT_SECRETS: `kid-old:${OLD_SECRET},kid-new:${NEW_SECRET}`,
        JWT_CURRENT_KID: "kid-new",
        JWT_EXPIRES_IN: "15m",
      },
    }));
    const { signAccessToken, verifyAccessToken, signWithKid } = await import("./jwt.js");
    const payload = { userId: "u1", stellarAddress: "GABC", role: "user", scopes: [] };
    const tOld = signWithKid(payload, "kid-old");
    const tNew = signAccessToken(payload);
    expect(verifyAccessToken(tOld).userId).toBe("u1");
    expect(verifyAccessToken(tNew).userId).toBe("u1");
  });
});
