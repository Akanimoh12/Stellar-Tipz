import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { UnauthorizedError } from "../../common/errors/AppError.js";
import type { AuthPayload } from "./auth.types.js";

/**
 * JWT key rotation support.
 *
 * Single-secret path (backward compatible):
 *   keys = Map { "primary" => env.JWT_SECRET }, currentKid = "primary"
 *
 * Rotation path (JWT_SECRETS set):
 *   JWT_SECRETS is parsed as:
 *     1) JSON object {kid: secret, ...}
 *     2) JSON array [{kid, secret}, ...]
 *     3) CSV string "kid:secret,kid2:secret2"
 *   JWT_CURRENT_KID selects signing key; defaults to last key in map.
 *   Verification accepts any kid in the set. Tokens without kid fall back
 *   to env.JWT_SECRET and then to all known keys for legacy compatibility.
 *   Signing always emits `kid` header via `keyid` option.
 *
 * Rotation procedure (zero session loss):
 *   1) Generate new secret + kid (e.g. "2026-08-rotation").
 *   2) Set JWT_SECRETS="kid-old:secret-old,kid-new:secret-new" and
 *      JWT_CURRENT_KID="kid-new". Deploy.
 *      Old tokens (kid-old) still verify; new tokens use kid-new.
 *   3) After 2× JWT_EXPIRES_IN (or documented 7-day window, whichever is
 *      larger) all old tokens have expired. Remove kid-old from JWT_SECRETS.
 *   4) Deploy removal. No sessions are invalidated at any step.
 */

export interface JwtKeySet {
  keys: Map<string, string>;
  currentKid: string;
}

function parseJwtKeysRaw(): JwtKeySet {
  const raw = env.JWT_SECRETS?.trim();

  // Single-secret backward-compat path
  if (!raw) {
    return { keys: new Map([["primary", env.JWT_SECRET]]), currentKid: "primary" };
  }

  const keys = new Map<string, string>();
  let parsedAsJson = false;

  // Attempt JSON parse
  try {
    const json = JSON.parse(raw);
    if (Array.isArray(json)) {
      for (const entry of json) {
        if (
          entry &&
          typeof entry === "object" &&
          typeof (entry as Record<string, unknown>).kid === "string" &&
          typeof (entry as Record<string, unknown>).secret === "string"
        ) {
          const kid = ((entry as Record<string, string>).kid ?? "").trim();
          const secret = ((entry as Record<string, string>).secret ?? "").trim();
          if (kid && secret) keys.set(kid, secret);
        }
      }
      parsedAsJson = true;
    } else if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      for (const [kid, val] of Object.entries(obj)) {
        if (typeof val === "string" && kid.trim() && val.trim()) {
          keys.set(kid.trim(), val.trim());
        }
      }
      parsedAsJson = true;
    }
  } catch {
    parsedAsJson = false;
  }

  // Fallback to CSV "kid:secret,kid2:secret2"
  if (!parsedAsJson || keys.size === 0) {
    if (!parsedAsJson) {
      // Only parse CSV if JSON didn't succeed; otherwise keys already set
      keys.clear();
      const parts = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const part of parts) {
        const sep = part.indexOf(":");
        if (sep <= 0) continue;
        const kid = part.slice(0, sep).trim();
        const secret = part.slice(sep + 1).trim();
        if (kid && secret) keys.set(kid, secret);
      }
    }
  }

  // If parsing yielded nothing, fall back to single-secret
  if (keys.size === 0) {
    return { keys: new Map([["primary", env.JWT_SECRET]]), currentKid: "primary" };
  }

  // Determine currentKid
  let currentKid = env.JWT_CURRENT_KID?.trim();
  if (!currentKid || !keys.has(currentKid)) {
    // Prefer the key whose secret equals env.JWT_SECRET if present (previous current)
    // otherwise use the last inserted key (newest rotation key)
    const kids = Array.from(keys.keys());
    if (currentKid && !keys.has(currentKid)) {
      // Invalid currentKid: fall back to last key
      currentKid = kids[kids.length - 1];
    } else if (!currentKid) {
      currentKid = kids[kids.length - 1];
    }
  }

  // Ensure currentKid is valid
  if (!keys.has(currentKid)) {
    currentKid = Array.from(keys.keys())[0];
  }

  return { keys, currentKid: currentKid! };
}

/**
 * Returns the current JwtKeySet. Parsed on every call so that tests
 * that mock `env` via vi.mock see updated values without a restart.
 * In production the env object is stable, so parsing cost is negligible.
 */
export function getJwtKeySet(): JwtKeySet {
  return parseJwtKeysRaw();
}

export function getCurrentKid(): string {
  return getJwtKeySet().currentKid;
}

export function getJwtKeys(): Map<string, string> {
  return getJwtKeySet().keys;
}

/**
 * Sign an AuthPayload, emitting `kid` header pointing at the current key.
 */
export function signAccessToken(payload: AuthPayload): string {
  const { keys, currentKid } = getJwtKeySet();
  const secret = keys.get(currentKid);
  if (!secret) {
    throw new Error(`JWT current kid "${currentKid}" not found in key set`);
  }
  return jwt.sign(payload, secret, {
    expiresIn: env.JWT_EXPIRES_IN,
    keyid: currentKid,
  } as jwt.SignOptions);
}

/**
 * Sign with a specific kid (used in tests to simulate old-key signing).
 */
export function signWithKid(payload: AuthPayload, kid: string): string {
  const { keys } = getJwtKeySet();
  const secret = keys.get(kid);
  if (!secret) throw new Error(`Unknown kid for signing: ${kid}`);
  return jwt.sign(payload, secret, {
    expiresIn: env.JWT_EXPIRES_IN,
    keyid: kid,
  } as jwt.SignOptions);
}

/**
 * Verify a JWT. Accepts any key in the set; validates kid header if present.
 * - If `kid` header present: only that key is tried; unknown kid => 401.
 * - If no `kid`: tries env.JWT_SECRET first (legacy tokens), then all known keys.
 * Throws UnauthorizedError on any failure (invalid signature, expired, unknown kid).
 */
export function verifyAccessToken(token: string): AuthPayload {
  let header: { kid?: string } | null = null;
  try {
    // Handle test mocks where decode may not be provided (withdrawals.test mocks only verify)
    const decodeFn = (jwt as unknown as { decode?: typeof jwt.decode }).decode;
    if (typeof decodeFn === "function") {
      const decoded = decodeFn(token, { complete: true } as never) as {
        header: { kid?: string };
        payload: unknown;
      } | null;
      header = decoded?.header ?? null;
    } else {
      header = null;
    }
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }

  // If header is null (e.g., legacy token or mocked decode), fall through to legacy path
  // instead of throwing. Only throw if decode explicitly returned a header-less object?
  // For mocked environments where decode is absent, we treat as legacy no-kid token.
  const kid = header?.kid;
  const { keys } = getJwtKeySet();

  if (kid) {
    const secret = keys.get(kid);
    if (!secret) {
      throw new UnauthorizedError(`Unknown key id: ${kid}`);
    }
    try {
      return jwt.verify(token, secret) as AuthPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError("Invalid or expired access token");
      }
      throw new UnauthorizedError("Invalid or expired access token");
    }
  }

  // Legacy path: no kid header (pre-rotation token)
  const candidates: string[] = [];
  // Legacy secret first for single-secret deployments
  candidates.push(env.JWT_SECRET);
  for (const s of keys.values()) {
    if (!candidates.includes(s)) candidates.push(s);
  }

  let lastError: unknown = null;
  for (const secret of candidates) {
    try {
      return jwt.verify(token, secret) as AuthPayload;
    } catch (err) {
      lastError = err;
      if (err instanceof jwt.TokenExpiredError) {
        // Expired is a hard failure; don't try other keys
        throw new UnauthorizedError("Invalid or expired access token");
      }
      // Try next candidate for signature mismatch
      continue;
    }
  }
  throw new UnauthorizedError("Invalid or expired access token");
}

/**
 * For tests: clear any internal cache. Currently no-op (parsing is stateless)
 * but retained for API stability if caching is added later.
 */
export function __clearJwtCache(): void {
  // no cache
}
