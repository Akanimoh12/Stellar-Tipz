import { describe, expect, it } from 'vitest';

import { ERRORS, categorizeError } from '../error';

describe('error helpers', () => {
  it('categorizes nullish errors as unknown', () => {
    expect(categorizeError(null)).toEqual({
      category: 'unknown',
      message: 'An unexpected error occurred.',
      retryable: true,
    });
  });

  it('categorizes timeout errors', () => {
    expect(categorizeError('Polling timeout reached')).toEqual({
      category: 'timeout',
      message: 'The request timed out. Please try again.',
      retryable: true,
    });
  });

  it('categorizes network errors', () => {
    expect(categorizeError(new TypeError('Failed to fetch resource'))).toEqual({
      category: 'network',
      message: 'Network error. Please check your connection.',
      retryable: true,
    });
  });


  it('categorizes TypeError fetch failures via fallback condition', () => {
    expect(categorizeError(new TypeError('fetch exploded'))).toEqual({
      category: 'network',
      message: 'Network error. Please check your connection.',
      retryable: true,
    });
  });

  it('categorizes not-found errors', () => {
    expect(categorizeError('404 not found')).toEqual({
      category: 'not-found',
      message: ERRORS.NOT_FOUND,
      retryable: false,
    });
  });

  it('categorizes wallet errors', () => {
    expect(categorizeError('User rejected transaction in Freighter')).toEqual({
      category: 'wallet',
      message: 'Transaction was rejected by your wallet.',
      retryable: false,
    });
  });

  it('categorizes validation errors', () => {
    expect(categorizeError('Invalid amount: too short')).toEqual({
      category: 'validation',
      message: 'Please check your input and try again.',
      retryable: false,
    });
  });

  it('extracts and maps Soroban contract error codes', () => {
    expect(categorizeError(new Error('Simulation failed: Error(Contract, #8)'))).toEqual({
      category: 'contract',
      message: 'Insufficient balance.',
      retryable: false,
    });
  });

  it('falls back to generic contract message for unmapped code', () => {
    expect(categorizeError(new Error('Error(Contract, #99)'))).toEqual({
      category: 'contract',
      message: ERRORS.CONTRACT,
      retryable: false,
    });
  });



  it('uses generic contract message when no code is present', () => {
    expect(categorizeError(new Error('Error(Contract) execution failed'))).toEqual({
      category: 'contract',
      message: ERRORS.CONTRACT,
      retryable: false,
    });
  });

  it('falls back to unknown for uncategorized errors', () => {
    expect(categorizeError('strange issue')).toEqual({
      category: 'unknown',
      message: 'An unexpected error occurred.',
      retryable: true,
    });
  });
});
