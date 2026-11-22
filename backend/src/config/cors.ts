/**
 * CORS origin validation (issue #078).
 *
 * The API always runs with `credentials: true`, so the origin list is a
 * credential-theft surface if misconfigured. This module enforces a strict,
 * fail-at-startup convention:
 *
 *  - Every entry must be an absolute `http(s)` origin (scheme + host, no path,
 *    no userinfo, no wildcard).
 *  - A wildcard (`*`) is rejected outright: with credentials enabled it would
 *    allow any site to read authenticated responses.
 *  - In production, `localhost` (and loopback) origins are rejected — they
 *    indicate a misconfigured deployment and must never reach traffic.
 *
 * Invalid input throws, so `env.ts` parsing fails at boot rather than serving
 * a broken policy.
 */

const WILDCARD = '*';
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Parse a comma-separated `CORS_ORIGIN` value into validated absolute origins. */
export function parseCorsOrigins(raw: string): string[] {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new Error('CORS_ORIGIN must contain at least one origin');
  }

  if (entries.includes(WILDCARD)) {
    throw new Error(
      'CORS_ORIGIN must not contain "*" because credentials are enabled (issue #078)',
    );
  }

  const origins: string[] = [];
  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(`CORS_ORIGIN entry "${entry}" is not a valid absolute origin`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`CORS_ORIGIN entry "${entry}" must use the http or https scheme`);
    }
    if (!url.host) {
      throw new Error(`CORS_ORIGIN entry "${entry}" is missing a host`);
    }
    if (url.username || url.password) {
      throw new Error(`CORS_ORIGIN entry "${entry}" must not contain credentials`);
    }
    if (url.pathname !== '' && url.pathname !== '/') {
      throw new Error(`CORS_ORIGIN entry "${entry}" must not include a path`);
    }
    if (nodeEnv === 'production' && LOCALHOST_HOSTS.has(url.hostname)) {
      throw new Error(`CORS_ORIGIN must not include localhost in production (entry "${entry}")`);
    }

    origins.push(entry);
  }

  return origins;
}
