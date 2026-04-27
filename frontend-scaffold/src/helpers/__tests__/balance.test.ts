import { describe, expect, it } from 'vitest';

import { hasPositiveBalance } from '../balance';

describe('balance helpers', () => {
  it('returns false for empty values', () => {
    expect(hasPositiveBalance()).toBe(false);
    expect(hasPositiveBalance(null)).toBe(false);
    expect(hasPositiveBalance('')).toBe(false);
  });

  it('returns false for zero, negative, and invalid balances', () => {
    expect(hasPositiveBalance('0')).toBe(false);
    expect(hasPositiveBalance('-1')).toBe(false);
    expect(hasPositiveBalance('not-a-number')).toBe(false);
  });

  it('returns true for positive integer strings', () => {
    expect(hasPositiveBalance('1')).toBe(true);
    expect(hasPositiveBalance('9999999999999999999')).toBe(true);
  });
});
