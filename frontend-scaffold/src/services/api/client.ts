import { logger } from "../logger";
import { getApiBaseUrl } from "./baseUrl";
import { getValidAccessToken, refreshTokens } from "../auth/tokenManager";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message || `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Authenticated fetch against the backend API.
 * - Attaches `Authorization: Bearer <accessToken>` when a session exists.
 * - On 401: performs a single-flight token refresh and retries once.
 * - Concurrent 401s share the same refresh (tokenManager de-duplicates).
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = await getValidAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && retry) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return apiFetch<T>(path, init, false);
    }
    throw new AuthError("Session expired");
  }

  if (!res.ok) {
    logger.warn("services/api/client", "API request failed", {
      path,
      status: res.status,
    });
    throw new ApiError(res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
