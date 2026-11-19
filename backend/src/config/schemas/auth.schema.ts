import { z } from 'zod';
import { durationString } from './common.schema.js';

export const authEnvSchema = z.object({
  JWT_SECRET: z.string().min(8),
  /**
   * Optional JSON or comma-separated map of kid->secret for key rotation.
   * Supported formats:
   *  - JSON object: '{"kid1":"secret1","kid2":"secret2"}'
   *  - JSON array:  '[{"kid":"kid1","secret":"secret1"}]'
   *  - CSV:         'kid1:secret1,kid2:secret2'
   */
  JWT_SECRETS: z.string().optional(),
  /** Kid to use when signing new tokens. Must exist in JWT_SECRETS when rotation is configured. */
  JWT_CURRENT_KID: z.string().optional(),
  /** Access token TTL — must be a duration string like "15m" or "1h". */
  JWT_EXPIRES_IN: durationString.default('15m'),
  /** Refresh token TTL — must be a duration string like "7d" or "30d". */
  REFRESH_TOKEN_EXPIRES_IN: durationString.default('7d'),
  AUTH_CHALLENGE_TTL_SECONDS: z.coerce.number().default(300),
  /** Cron expression for the expired auth challenge cleanup job. Runs every 5 minutes by default. */
  AUTH_CHALLENGE_CLEANUP_CRON: z.string().default('*/5 * * * *'),
  /** Per-IP rate limit for auth endpoints (challenge + verify) within the window. */
  AUTH_RATE_LIMIT_PER_IP: z.coerce.number().int().positive().default(30),
  /** Per-address rate limit for auth endpoints within the window. */
  AUTH_RATE_LIMIT_PER_ADDRESS: z.coerce.number().int().positive().default(10),
  /** Auth rate limit window in milliseconds (default: 1 minute). */
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;
