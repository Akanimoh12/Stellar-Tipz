/**
 * Shared types for the auth module.
 */

export interface AuthPayload {
  userId: string;
  stellarAddress: string;
  role: string;
  scopes: string[];
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

export interface ChallengeResponse {
  challenge: string;
  expiresAt: string;
  network: string;
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
