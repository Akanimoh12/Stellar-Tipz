/**
 * Shared types for the auth module.
 */

export interface AuthPayload {
  userId: string;
  stellarAddress: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ChallengeResponse {
  challenge: string;
  expiresAt: string;
}

export interface VerifyRequest {
  stellarAddress: string;
  signature: string;
  challenge: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface MeResponse {
  id: string;
  stellarAddress: string;
  username: string | null;
  createdAt: string;
}
