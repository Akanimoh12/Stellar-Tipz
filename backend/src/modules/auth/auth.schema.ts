import { z } from 'zod';

/**
 * Zod validation schemas for auth endpoints.
 */

// ── Request schemas ───────────────────────────────────────────────────────────

export const challengeSchema = z.object({
  stellarAddress: z.string().min(1, 'Stellar address is required'),
});

export const verifySchema = z.object({
  stellarAddress: z.string().min(1, 'Stellar address is required'),
  signature: z.string().min(1, 'Signature is required'),
  challenge: z.string().min(1, 'Challenge is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type ChallengeInput = z.infer<typeof challengeSchema>;
export type VerifyInput = z.infer<typeof verifySchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

// ── #835 — JWT access token issuance util ─────────────────────────────────────

/** Input accepted by signAccessToken(). */
export const SignAccessTokenInputSchema = z.object({
  id: z.string().min(1, 'User id is required'),
  stellarAddress: z.string().min(1, 'Stellar address is required'),
});

export type SignAccessTokenInput = z.infer<typeof SignAccessTokenInputSchema>;

// ── #845 — GET /auth/me response ─────────────────────────────────────────────

/** Response shape for GET /auth/me */
export const MeResponseSchema = z.object({
  id: z.string(),
  stellarAddress: z.string(),
  username: z.string().nullable(),
  createdAt: z.string(),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;
