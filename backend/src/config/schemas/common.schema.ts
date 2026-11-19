import { z } from 'zod';

/**
 * Validates a duration string like "15m", "7d", "30s", "2h".
 * Accepted units: s (seconds), m (minutes), h (hours), d (days).
 */
export const durationString = z
  .string()
  .regex(/^\d+[smhd]$/, 'Must be a positive integer followed by s, m, h, or d (e.g. "15m", "7d")');

/** Accepts the literal strings "true"/"false" and coerces to a boolean. */
export const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');
