import { logger } from "../logger";
import { getApiBaseUrl } from "./baseUrl";
import { getValidAccessToken, refreshTokens } from "../auth/tokenManager";
import { setRequestId } from "../sentry";
import * as Sentry from "@sentry/react";

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
 * - Extracts and correlates x-request-id header for error tracing.
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

  const pathStr = path.startsWith("/") ? path : `/${path}`;
  const url = `${getApiBaseUrl()}${pathStr}`;
  const res = await fetch(url, { ...init, headers });

  // Extract request ID from response for frontend-to-backend correlation
  const requestId = res.headers.get("x-request-id");
  if (requestId) {
    setRequestId(requestId);
    // Also set a breadcrumb for this API request
    Sentry.captureMessage(`API Request: ${init.method || "GET"} ${path}`, {
      level: "debug",
      tags: {
        type: "api",
        method: init.method || "GET",
        path,
        status: res.status,
        request_id: requestId,
      },
    });
  }

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
