import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, AuthError } from "../client";
import { setTokens, resetTokenManagerForTests } from "../../auth/tokenManager";

function jwt(expSecFromNow: number): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecFromNow }),
  );
  return `${header}.${payload}.sig`;
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.unstubAllGlobals();
    resetTokenManagerForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    resetTokenManagerForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("attaches the Authorization header when a session exists", async () => {
    setTokens({ accessToken: jwt(900), refreshToken: "r1" });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await apiFetch<{ ok: boolean }>("/favorites");
    expect(result).toEqual({ ok: true });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get("Authorization")).toBe(
      `Bearer ${
        localStorage.getItem("tipz_auth_tokens")
          ? JSON.parse(localStorage.getItem("tipz_auth_tokens")!).accessToken
          : ""
      }`,
    );
    expect(headers.get("Accept")).toBe("application/json");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/api/v1/favorites");
  });

  it("omits Authorization when there is no session", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await apiFetch("/favorites");
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get("Authorization")).toBeNull();
  });

  it("refreshes once on 401 and retries the original request", async () => {
    setTokens({ accessToken: jwt(900), refreshToken: "r1" });
    const renewedAccess = jwt(900);

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accessToken: renewedAccess, refreshToken: "r2" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ favorites: [] }), { status: 200 }),
      );

    const result = await apiFetch<{ favorites: unknown[] }>("/favorites");
    expect(result).toEqual({ favorites: [] });
    expect(fetch).toHaveBeenCalledTimes(3);

    const retryHeaders = vi.mocked(fetch).mock.calls[2][1]?.headers as Headers;
    expect(retryHeaders.get("Authorization")).toBe(`Bearer ${renewedAccess}`);
  });

  it("throws AuthError when a 401 retry cannot refresh", async () => {
    setTokens({ accessToken: jwt(900), refreshToken: "r1" });

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response("", { status: 401 }));

    await expect(apiFetch("/favorites")).rejects.toBeInstanceOf(AuthError);
    // original + refresh attempt; the retry is not issued after failed refresh
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws ApiError with status on non-OK responses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 500 }));

    await expect(apiFetch("/favorites")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
    });
  });

  it("queues concurrent 401s onto a single refresh", async () => {
    setTokens({ accessToken: jwt(900), refreshToken: "r1" });
    const renewedAccess = jwt(900);
    let refreshCalls = 0;

    vi.mocked(fetch).mockImplementation((async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        refreshCalls += 1;
        // Small delay so both concurrent 401 handlers reach refreshTokens
        // while the first refresh is still in flight.
        await new Promise((r) => setTimeout(r, 5));
        return new Response(
          JSON.stringify({ accessToken: renewedAccess, refreshToken: "r2" }),
          { status: 200 },
        );
      }
      const auth = new Headers(init?.headers).get("Authorization");
      if (auth === `Bearer ${renewedAccess}`) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("", { status: 401 });
    }) as typeof fetch);

    vi.useRealTimers();

    const [a, b] = await Promise.all([
      apiFetch<{ ok: boolean }>("/favorites"),
      apiFetch<{ ok: boolean }>("/favorites"),
    ]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
  });
});
