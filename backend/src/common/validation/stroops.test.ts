import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../errors/AppError.js';
import {
  MAX_STROOP_AMOUNT,
  STROOPS_PER_XLM,
  parseStroops,
  stroopAmountSchema,
} from './stroops.js';

describe('parseStroops (issue #088)', () => {
  it('parses integer strings, numbers, and bigints', () => {
    expect(parseStroops('100')).toBe(100n);
    expect(parseStroops(100)).toBe(100n);
    expect(parseStroops(100n)).toBe(100n);
  });

  it('defines the stroop unit and int64 cap', () => {
    expect(STROOPS_PER_XLM).toBe(10_000_000n);
    expect(MAX_STROOP_AMOUNT).toBe(2n ** 63n - 1n);
  });

  it('rejects negative amounts', () => {
    expect(() => parseStroops('-1')).toThrow(BadRequestError);
    expect(() => parseStroops(-1)).toThrow(BadRequestError);
    expect(() => parseStroops(-1n)).toThrow(BadRequestError);
  });

  it('rejects zero unless allowZero is set', () => {
    expect(() => parseStroops('0')).toThrow(BadRequestError);
    expect(parseStroops('0', { allowZero: true })).toBe(0n);
  });

  it('rejects fractional input (no float arithmetic on amounts)', () => {
    expect(() => parseStroops('1.5')).toThrow(BadRequestError);
    expect(() => parseStroops(1.5)).toThrow(BadRequestError);
  });

  it('rejects out-of-range amounts above the int64 stroop cap', () => {
    expect(() => parseStroops(MAX_STROOP_AMOUNT + 1n)).toThrow(BadRequestError);
  });

  it('accepts the maximum int64 stroop amount', () => {
    expect(parseStroops(MAX_STROOP_AMOUNT)).toBe(MAX_STROOP_AMOUNT);
  });

  it('rejects non-numeric and nullish input', () => {
    expect(() => parseStroops('abc')).toThrow(BadRequestError);
    expect(() => parseStroops({})).toThrow(BadRequestError);
    expect(() => parseStroops(null)).toThrow(BadRequestError);
  });

  it('uses the field name in error messages', () => {
    expect(() => parseStroops('-1', { field: 'feeStroops' })).toThrow(/feeStroops/);
  });

  it('zod schema normalises to bigint', () => {
    expect(stroopAmountSchema.parse('42')).toBe(42n);
    expect(stroopAmountSchema.parse(42)).toBe(42n);
    expect(stroopAmountSchema.parse(42n)).toBe(42n);
  });
});
