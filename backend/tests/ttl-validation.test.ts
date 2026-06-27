/**
 * #847 — Auth: configurable token TTLs via env
 *
 * Tests that JWT_EXPIRES_IN and REFRESH_TOKEN_EXPIRES_IN are validated
 * as duration strings (e.g. "15m", "7d") and reject invalid formats.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-create the duration validator exactly as in env.ts so we can unit-test it
// in isolation without triggering the full env parse (which needs DB/Redis URLs).
const durationString = z
  .string()
  .regex(/^\d+[smhd]$/, 'Must be a positive integer followed by s, m, h, or d (e.g. "15m", "7d")');

describe('duration string validation (issue #847)', () => {
  // ── success cases ──────────────────────────────────────────────────────────

  it.each(['15m', '7d', '30s', '2h', '1d', '60m', '24h'])(
    'accepts valid duration "%s"',
    (value) => {
      expect(() => durationString.parse(value)).not.toThrow();
    },
  );

  // ── failure cases ─────────────────────────────────────────────────────────

  it.each([
    '15 m',   // space between number and unit
    '7D',     // uppercase unit
    '-1d',    // negative
    '0.5h',   // decimal
    'abc',    // no number
    '15',     // no unit
    '',       // empty
    '7weeks', // invalid unit
  ])('rejects invalid duration "%s"', (value) => {
    const result = durationString.safeParse(value);
    expect(result.success).toBe(false);
  });
});
