/**
 * Resolves the backend API base path.
 * VITE_API_BASE_URL overrides the default (/api/v1).
 * Trailing slashes are stripped so callers can concatenate paths safely.
 */
export function getApiBaseUrl(): string {
  const fromEnv = (import.meta as { env?: Record<string, string | undefined> })
    .env?.VITE_API_BASE_URL;
  return (fromEnv || "/api/v1").replace(/\/+$/, "");
}
