import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  decodeTokenExpMs,
  setTokens,
  clearTokens,
  hasSession,
  hasValidSession,
  getValidAccessToken,
  refreshTokens,
  getTokenManagerStatus,
  subscribeTokenManager,
  forceLogout,
  dismissReauth,
  resetTokenManagerForTests,
  REFRESH_MARGIN_MS,
} from "../tokenManager";

function makeJwt(expMs: number): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(expMs / 1000) }));
  return `${header}.${payload}.sig`;
}

describe("tokenManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.stubGlobal("fetch", vi.fn());
    resetTokenManagerForTests();
  });

  afterEach(() => {
    resetTokenManagerForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("decodeTokenExpMs", () => {
    it("decodes the exp claim to milliseconds", () => {
      const expSec = Math.floor(Date.now() / 1000) + 900;
      const jwt = makeJwt(expSec * 1000);
      expect(decodeTokenExpMs(jwt)).toBe(expSec * 1000);
    });

    it("returns null for malformed tokens", () => {
      expect(decodeTokenExpMs("not-a-jwt")).toBeNull();
      expect(decodeTokenExpMs("a.!!!.c")).toBeNull();
    });
  });

  describe("setTokens / clearTokens / status", () => {
    it("moves to authenticated on setTokens and persists", () => {
      setTokens({
        accessToken: makeJwt(Date.now() + 900_000),
        refreshToken: "r1",
      });
      expect(getTokenManagerStatus()).toBe("authenticated");
      expect(hasSession()).toBe(true);
      expect(hasValidSession()).toBe(true);
      expect(localStorage.getItem("tipz_auth_tokens")).not.toBeNull();
    });

    it("moves to unauthenticated on clearTokens and removes storage", () => {
      setTokens({
        accessToken: makeJwt(Date.now() + 900_000),
        refreshToken: "r1",
      });
      clearTokens();
      expect(getTokenManagerStatus()).toBe("unauthenticated");
      expect(hasSession()).toBe(false);
      expect(localStorage.getItem("tipz_auth_tokens")).toBeNull();
    });

    it("notifies subscribers on status changes", () => {
      const seen: string[] = [];
      const unsub = subscribeTokenManager((s) => seen.push(s));
      setTokens({
        accessToken: makeJwt(Date.now() + 900_000),
        refreshToken: "r1",
      });
      expect(seen).toContain("authenticated");
      unsub();
      clearTokens();
      expect(seen).not.toContain("unauthenticated");
    });
  });

  describe("getValidAccessToken", () => {
    it("returns the access token without refreshing when far from expiry", async () => {
      const accessToken = makeJwt(Date.now() + 900_000);
      setTokens({ accessToken, refreshToken: "r1" });

      const token = await getValidAccessToken();
      expect(token).toBe(accessToken);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("refreshes when the token is within the refresh margin", async () => {
      const expiring = makeJwt(Date.now() + REFRESH_MARGIN_MS - 5_000);
      const renewedAccess = makeJwt(Date.now() + 900_000);
      setTokens({ accessToken: expiring, refreshToken: "r1" });

      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ accessToken: renewedAccess, refreshToken: "r2" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const token = await getValidAccessToken();
      expect(token).toBe(renewedAccess);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(getTokenManagerStatus()).toBe("authenticated");
    });

    it("returns null when there is no session", async () => {
      expect(await getValidAccessToken()).toBeNull();
    });
  });

  describe("refreshTokens single-flight", () => {
    it("shares one in-flight refresh across concurrent callers", async () => {
      const renewedAccess = makeJwt(Date.now() + 900_000);
      setTokens({
        accessToken: makeJwt(Date.now() + 1_000),
        refreshToken: "r1",
      });

      let resolveFetch!: (r: Response) => void;
      vi.mocked(fetch).mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      );

      const p1 = refreshTokens();
      const p2 = refreshTokens();
      const p3 = refreshTokens();

      resolveFetch(
        new Response(
          JSON.stringify({ accessToken: renewedAccess, refreshToken: "r2" }),
          { status: 200 },
        ),
      );

      const results = await Promise.all([p1, p2, p3]);
      expect(fetch).toHaveBeenCalledTimes(1);
      for (const r of results) {
        expect(r?.accessToken).toBe(renewedAccess);
      }
      expect(getTokenManagerStatus()).toBe("authenticated");
    });

    it("sets reauth-required on refresh failure and keeps tokens for retry", async () => {
      setTokens({
        accessToken: makeJwt(Date.now() + 1_000),
        refreshToken: "r1",
      });
      vi.mocked(fetch).mockRejectedValue(new Error("network down"));

      const result = await refreshTokens();
      expect(result).toBeNull();
      expect(getTokenManagerStatus()).toBe("reauth-required");
      expect(hasValidSession()).toBe(false);
      // tokens kept so "Try again" can retry
      expect(hasSession()).toBe(true);
    });

    it("sets reauth-required immediately when there is no refresh token", async () => {
      const result = await refreshTokens();
      expect(result).toBeNull();
      expect(getTokenManagerStatus()).toBe("reauth-required");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("forceLogout / dismissReauth", () => {
    it("forceLogout clears tokens, marks reauth-required, and revokes remotely", async () => {
      setTokens({
        accessToken: makeJwt(Date.now() + 900_000),
        refreshToken: "r1",
      });
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ message: "ok" }), { status: 200 }),
      );

      await forceLogout("idle-timeout");

      expect(hasSession()).toBe(false);
      expect(getTokenManagerStatus()).toBe("reauth-required");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/logout"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("dismissReauth returns to authenticated when tokens remain", () => {
      setTokens({
        accessToken: makeJwt(Date.now() + 900_000),
        refreshToken: "r1",
      });
      // simulate reauth-required via failed refresh without tokens removed
      vi.mocked(fetch).mockRejectedValue(new Error("fail"));
      return refreshTokens().then(() => {
        expect(getTokenManagerStatus()).toBe("reauth-required");
        dismissReauth();
        expect(getTokenManagerStatus()).toBe("authenticated");
      });
    });

    it("dismissReauth returns to unauthenticated when no tokens", () => {
      dismissReauth();
      expect(getTokenManagerStatus()).toBe("unauthenticated");
    });
  });

  describe("proactive refresh scheduling", () => {
    it("schedules a refresh before the access token expires", async () => {
      const expMs = Date.now() + REFRESH_MARGIN_MS + 30_000;
      setTokens({ accessToken: makeJwt(expMs), refreshToken: "r1" });

      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            accessToken: makeJwt(Date.now() + 900_000),
            refreshToken: "r2",
          }),
          { status: 200 },
        ),
      );

      await vi.advanceTimersByTimeAsync(30_001);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/refresh"),
        expect.anything(),
      );
    });
  });
});
