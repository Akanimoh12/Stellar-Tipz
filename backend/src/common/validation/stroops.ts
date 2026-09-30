import { z } from 'zod';
import { BadRequestError } from '../errors/AppError.js';

/** Stroops per XLM. 1 XLM = 10,000,000 stroops. */
export const STROOPS_PER_XLM = 10_000_000n;

/**
 * Maximum stroop amount accepted at the API/DB boundary.
 *
 * Stellar amounts are `i64` on chain, so we cap at the largest positive int64.
 * This keeps values exact within both the database (BigInt) and contract
 * (`i128`) ranges while leaving headroom, and — critically — it is far below
 * `Number.MAX_SAFE_INTEGER`, so an amount can never silently lose precision by
 * being coerced to a JavaScript `number` (issue #088).
 */
export const MAX_STROOP_AMOUNT = 2n ** 63n - 1n;

export interface StroopParseOptions {
  /** Allow a zero amount (e.g. optional/refundable balances). Default false. */
  allowZero?: boolean;
  /** Field name used in error messages. Default "amount". */
  field?: string;
}

/**
 * Parse an unknown input into a stroop amount as a `bigint`, enforcing the
 * unit convention documented in `docs/UNITS.md`:
 *
 *  - stroops are integers (no fractional stroops),
 *  - never negative,
 *  - never zero unless explicitly allowed,
 *  - never above {@link MAX_STROOP_AMOUNT}.
 *
 * Floats, decimal strings, and non-numeric input are rejected. The return type
 * is always `bigint`, so callers handle amounts uniformly at the boundary.
 */
export function parseStroops(input: unknown, options: StroopParseOptions = {}): bigint {
  const field = options.field ?? 'amount';
  let value: bigint;

  if (typeof input === 'bigint') {
    value = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new BadRequestError(`${field} must be an integer number of stroops`);
    }
    value = BigInt(trimmed);
  } else if (typeof input === 'number') {
    if (!Number.isInteger(input)) {
      throw new BadRequestError(`${field} must be an integer number of stroops (no floats)`);
    }
    value = BigInt(input);
  } else {
    throw new BadRequestError(`${field} must be a stroop amount`);
  }

  if (value < 0n) {
    throw new BadRequestError(`${field} must not be negative`);
  }
  if (value === 0n && !options.allowZero) {
    throw new BadRequestError(`${field} must be greater than zero`);
  }
  if (value > MAX_STROOP_AMOUNT) {
    throw new BadRequestError(`${field} exceeds the maximum allowed stroop amount`);
  }

  return value;
}

/**
 * Zod schema for a stroop amount. Accepts a bigint, an integer number, or an
 * integer string and normalises it to a `bigint` via {@link parseStroops}.
 */
export const stroopAmountSchema = z
  .union([z.bigint(), z.number().int(), z.string().regex(/^-?\d+$/)])
  .transform((value) => parseStroops(value));
