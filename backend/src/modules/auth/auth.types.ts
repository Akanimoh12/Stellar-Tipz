/**
 * Shared types for the auth module.
 */

export interface AuthPayload {
  userId: string;
  stellarAddress: string;
  role: string;
  scopes: string[];
  sessionId?: string;
}

export interface AuthUser {
  id: string;
  stellarAddress: string;
  username: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SessionMetadata {
  device: string;
  ipAddress: string;
}

export interface AuthSession {
  id: string;
  device: string;
  ip: string;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
}

export interface ChallengeResponse {
  /** The raw nonce the wallet must sign. */
  challenge: string;
  /** ISO-8601 expiry timestamp. */
  expiresAt: string;
  /** Network the challenge is bound to. */
  network: string;
  /** Stellar network passphrase to embed in the signed message. */
  networkPassphrase: string;
  /** Human-readable domain prefix to embed in the signed message. */
  domain: string;
}

export interface VerifyRequest {
  stellarAddress: string;
  signature: string;
  challenge: string;
  network?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface MeResponse {
  id: string;
  stellarAddress: string;
  username: string | null;
  role: string;
  scopes: string[];
  createdAt: string;
}
