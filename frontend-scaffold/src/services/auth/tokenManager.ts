import { useSyncExternalStore } from "react";
import { logger } from "../logger";
import { getApiBaseUrl } from "../api/baseUrl";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export type AuthStatus =
  | "unauthenticated"
  | "authenticated"
  | "refreshing"
  | "reauth-required";

const STORAGE_KEY = "tipz_auth_tokens";

/** Refresh the access token this long before it expires. */
export const REFRESH_MARGIN_MS = 60_000;

let tokens: TokenPair | null = null;
let refreshInFlight: Promise<TokenPair | null> | null = null;
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;
let status: AuthStatus = "unauthenticated";
const listeners = new Set<(status: AuthStatus) => void>();

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TokenPair;
      if (
        parsed &&
        typeof parsed.accessToken === "string" &&
        typeof parsed.refreshToken === "string"
      ) {
        tokens = parsed;
        status = "authenticated";
      }
    }
  } catch {
    tokens = null;
  }
}

loadFromStorage();

function setStatus(next: AuthStatus): void {
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => listener(status));
}

function persist(): void {
  try {
    if (tokens) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage failures are non-fatal
  }
}

function clearProactiveTimer(): void {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer);
    proactiveTimer = null;
  }
}

function scheduleProactiveRefresh(): void {
  clearProactiveTimer();
  if (!tokens) return;
  const exp = decodeTokenExpMs(tokens.accessToken);
  if (exp === null) return;
  const delay = Math.max(0, exp - REFRESH_MARGIN_MS - Date.now());
  proactiveTimer = setTimeout(() => {
    void refreshTokens();
  }, delay);
}

/** Decode a JWT payload's exp claim (seconds → ms). Returns null when unreadable. */
export function decodeTokenExpMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function getTokenManagerStatus(): AuthStatus {
  return status;
}

export function subscribeTokenManager(
  listener: (status: AuthStatus) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reactive auth status for components (useSyncExternalStore over the token manager). */
export function useAuthStatus(): AuthStatus {
  return useSyncExternalStore(
    subscribeTokenManager,
    getTokenManagerStatus,
    getTokenManagerStatus,
  );
}

export function setTokens(pair: TokenPair): void {
  tokens = { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  persist();
  setStatus("authenticated");
  scheduleProactiveRefresh();
}

export function clearTokens(): void {
  tokens = null;
  clearProactiveTimer();
  persist();
  setStatus("unauthenticated");
}

export function hasSession(): boolean {
  return tokens !== null;
}

/** True when we hold tokens and are not waiting on the user to re-authenticate. */
export function hasValidSession(): boolean {
  return tokens !== null && status !== "reauth-required";
}

/**
 * Returns a non-expired access token, refreshing proactively when the token
 * is within REFRESH_MARGIN_MS of expiry. Concurrent callers share one refresh.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (!tokens) return null;
  const exp = decodeTokenExpMs(tokens.accessToken);
  if (exp === null || Date.now() < exp - REFRESH_MARGIN_MS) {
    return tokens.accessToken;
  }
  const refreshed = await refreshTokens();
  return refreshed ? refreshed.accessToken : null;
}

/**
 * Single-flight refresh: concurrent callers await the same in-flight request.
 * On failure the existing tokens are kept (so "Try again" can retry) and the
 * status moves to reauth-required.
 */
export function refreshTokens(): Promise<TokenPair | null> {
  if (refreshInFlight) return refreshInFlight;
  if (!tokens?.refreshToken) {
    setStatus("reauth-required");
    return Promise.resolve(null);
  }

  const refreshTokenValue = tokens.refreshToken;
  setStatus("refreshing");

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      });
      if (!res.ok) {
        throw new Error(`refresh failed with status ${res.status}`);
      }
      const body = (await res.json()) as Partial<TokenPair>;
      if (!body.accessToken || !body.refreshToken) {
        throw new Error("invalid refresh response");
      }
      setTokens({
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
      });
      return tokens;
    } catch (err) {
      logger.warn(
        "services/auth/tokenManager",
        "Token refresh failed",
        undefined,
        err instanceof Error ? err : new Error(String(err)),
      );
      setStatus("reauth-required");
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Ends the session locally (best-effort server revoke) and asks the UI to
 * show the re-auth prompt. Never clears form drafts or localStorage outside
 * the token key.
 */
export async function forceLogout(reason: string): Promise<void> {
  const refreshTokenValue = tokens?.refreshToken;
  clearTokens();
  setStatus("reauth-required");
  logger.warn("services/auth/tokenManager", "Session ended", { reason });
  if (!refreshTokenValue) return;
  try {
    await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    });
  } catch {
    // best-effort revoke — local session is already cleared
  }
}

/** User chose to continue without signing in. */
export function dismissReauth(): void {
  setStatus(tokens ? "authenticated" : "unauthenticated");
}

/** Reset module state between tests. */
export function resetTokenManagerForTests(): void {
  clearProactiveTimer();
  refreshInFlight = null;
  tokens = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  setStatus("unauthenticated");
}
