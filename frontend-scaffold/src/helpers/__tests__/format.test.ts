import BigNumber from 'bignumber.js';
import { describe, expect, it } from 'vitest';

import {
  camelToSnake,
  formatTimestamp,
  formatTokenAmount,
  formatXlmDisplay,
  mapContractResponse,
  stroopToXlm,
  stroopToXlmBigNumber,
  truncateString,
  xlmToStroop,
} from '../format';

describe('format helpers', () => {
  it('maps nested snake_case keys to camelCase', () => {
    const response = {
      user_name: 'alice',
      tip_history: [{ tip_amount: '100' }],
      nested_obj: { created_at: 123 },
    };

    expect(mapContractResponse(response)).toEqual({
      userName: 'alice',
      tipHistory: [{ tipAmount: '100' }],
      nestedObj: { createdAt: 123 },
    });
  });

  it('maps nested camelCase keys to snake_case', () => {
    const payload = {
      userName: 'alice',
      tipHistory: [{ tipAmount: '100' }],
      nestedObj: { createdAt: 123 },
    };

    expect(camelToSnake(payload)).toEqual({
      user_name: 'alice',
      tip_history: [{ tip_amount: '100' }],
      nested_obj: { created_at: 123 },
    });
  });

  it('truncateString keeps head and tail', () => {
    expect(truncateString('GABCDEFGHIJKLMNOP')).toBe('GABCD…LMNOP');
    expect(truncateString('')).toBe('');
  });

  it('formatTimestamp converts seconds into Date', () => {
    expect(formatTimestamp(1711929600).toISOString()).toBe('2024-04-01T00:00:00.000Z');
  });

  it('stroopToXlm formats BigNumber and primitive inputs', () => {
    expect(stroopToXlm(new BigNumber('12345678'))).toBe('1.23');
    expect(stroopToXlm('12345678', 4)).toBe('1.2346');
  });

  it('stroopToXlmBigNumber returns precise BigNumber', () => {
    expect(stroopToXlmBigNumber('12000000').toString()).toBe('1.2');
    expect(stroopToXlmBigNumber(new BigNumber('5000000')).toString()).toBe('0.5');
  });

  it('xlmToStroop rounds primitive lumens and handles BigNumber', () => {
    expect(xlmToStroop('1.23456789').toString()).toBe('12345679');
    expect(xlmToStroop(new BigNumber('2')).toString()).toBe('20000000');
  });

  it('formatTokenAmount handles decimals and trims trailing zeros', () => {
    expect(formatTokenAmount(new BigNumber('1000000001'), 7)).toBe('100.0000001');
    expect(formatTokenAmount(new BigNumber('12000000'), 7)).toBe('1.2');
    expect(formatTokenAmount(new BigNumber('10000000'), 7)).toBe('1');
    expect(formatTokenAmount(new BigNumber('1200'), 0)).toBe('1200');
  });

  it('formatXlmDisplay constrains decimal places between 2 and 7', () => {
    expect(formatXlmDisplay(new BigNumber('1'))).toBe('1.00');
    expect(formatXlmDisplay(new BigNumber('1.2345'))).toBe('1.2345');
    expect(formatXlmDisplay(new BigNumber('1.123456789'))).toBe('1.1234568');
  });
});
