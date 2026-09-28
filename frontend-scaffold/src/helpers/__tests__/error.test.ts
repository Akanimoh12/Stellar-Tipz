import { describe, expect, it, vi } from 'vitest';

import { 
  ERRORS, 
  categorizeError, 
  extractContractErrorCode, 
  extractApiErrorCode,
  CONTRACT_ERROR_CODES,
  API_ERROR_CODES,
  reportUnmappedError 
} from '../error';

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
    const result = categorizeError(new Error('Simulation failed: Error(Contract, #14)'));
    expect(result).toEqual({
      category: 'contract',
      message: CONTRACT_ERROR_CODES[14],
      retryable: false,
      technicalDetails: 'Contract error code: #14',
    });
    expect(result.message).toContain('Insufficient balance');
  });

  it('falls back to generic contract message for unmapped code', () => {
    expect(categorizeError(new Error('Error(Contract, #99)'))).toEqual({
      category: 'contract',
      message: ERRORS.CONTRACT,
      retryable: false,
      technicalDetails: 'Contract error code: #99',
    });
  });

  it('uses generic contract message when no code is present', () => {
    const result = categorizeError(new Error('Error(Contract) execution failed'));
    expect(result).toEqual({
      category: 'contract',
      message: ERRORS.CONTRACT,
      retryable: false,
    });
    expect(result.technicalDetails).toBeUndefined();
  });

  it('falls back to unknown for uncategorized errors', () => {
    expect(categorizeError('strange issue')).toEqual({
      category: 'unknown',
      message: 'An unexpected error occurred.',
      retryable: true,
    });
  });
});

describe('extractContractErrorCode', () => {
  it('extracts error code from standard format', () => {
    expect(extractContractErrorCode('Error(Contract, #8)')).toBe(8);
  });

  it('extracts error code with spaces', () => {
    expect(extractContractErrorCode('Error(Contract, #  14)')).toBe(14);
  });

  it('returns null when no error code is present', () => {
    expect(extractContractErrorCode('Error(Contract)')).toBeNull();
  });

  it('returns null for malformed error message', () => {
    expect(extractContractErrorCode('Some random error')).toBeNull();
  });
});

describe('extractApiErrorCode', () => {
  it('extracts API error code from standard format', () => {
    expect(extractApiErrorCode({ error: { code: 'BAD_REQUEST' } })).toBe('BAD_REQUEST');
  });

  it('returns null when no error code is present', () => {
    expect(extractApiErrorCode({ error: { message: 'Some error' } })).toBeNull();
  });

  it('returns null for malformed error object', () => {
    expect(extractApiErrorCode({ message: 'Some error' })).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractApiErrorCode(null)).toBeNull();
  });
});

describe('CONTRACT_ERROR_CODES mapping', () => {
  it('has mappings for all contract error codes', () => {
    // Check a few key error codes
    expect(CONTRACT_ERROR_CODES[1]).toContain('not been initialized');
    expect(CONTRACT_ERROR_CODES[14]).toContain('Insufficient balance');
    expect(CONTRACT_ERROR_CODES[25]).toContain('cannot tip yourself');
  });

  it('provides actionable messages with what happened and what to do', () => {
    // Messages should explain what happened and what to do
    const message = CONTRACT_ERROR_CODES[14];
    expect(message).toMatch(/insufficient balance/i);
    expect(message).toMatch(/please/i);
  });

  it('includes technical context for common errors', () => {
    expect(CONTRACT_ERROR_CODES[3]).toContain('not authorized');
    expect(CONTRACT_ERROR_CODES[10]).toContain('username is already taken');
  });
});

describe('API_ERROR_CODES mapping', () => {
  it('has mappings for all API error codes', () => {
    expect(API_ERROR_CODES['BAD_REQUEST']).toBeDefined();
    expect(API_ERROR_CODES['UNAUTHORIZED']).toBeDefined();
    expect(API_ERROR_CODES['FORBIDDEN']).toBeDefined();
    expect(API_ERROR_CODES['NOT_FOUND']).toBeDefined();
    expect(API_ERROR_CODES['CONFLICT']).toBeDefined();
    expect(API_ERROR_CODES['INTERNAL_ERROR']).toBeDefined();
    expect(API_ERROR_CODES['VALIDATION_ERROR']).toBeDefined();
  });

  it('provides actionable messages', () => {
    expect(API_ERROR_CODES['BAD_REQUEST']).toMatch(/check your input/i);
    expect(API_ERROR_CODES['UNAUTHORIZED']).toMatch(/log in/i);
  });
});

describe('categorizeError with API errors', () => {
  it('maps known API error codes', () => {
    const apiError = { error: { code: 'BAD_REQUEST', message: 'Invalid input' } };
    expect(categorizeError(apiError)).toEqual({
      category: 'unknown',
      message: API_ERROR_CODES['BAD_REQUEST'],
      retryable: true,
      technicalDetails: 'API error code: BAD_REQUEST',
    });
  });

  it('maps UNAUTHORIZED API error', () => {
    const apiError = { error: { code: 'UNAUTHORIZED', message: 'No token' } };
    expect(categorizeError(apiError)).toEqual({
      category: 'unknown',
      message: API_ERROR_CODES['UNAUTHORIZED'],
      retryable: false,
      technicalDetails: 'API error code: UNAUTHORIZED',
    });
  });

  it('handles unknown API error codes with fallback', () => {
    const apiError = { error: { code: 'UNKNOWN_CODE', message: 'Something happened' } };
    expect(categorizeError(apiError)).toEqual({
      category: 'unknown',
      message: 'An unexpected error occurred.',
      retryable: true,
    });
  });
});

describe('reportUnmappedError', () => {
  it('handles Sentry reporting gracefully', async () => {
    // Since reportUnmappedError uses dynamic import and try-catch,
    // it should not throw even if Sentry is not available
    await expect(
      reportUnmappedError(new Error('Error(Contract, #999)'), 'contract')
    ).resolves.not.toThrow();
  });

  it('handles API error reporting gracefully', async () => {
    await expect(
      reportUnmappedError({ error: { code: 'NEW_ERROR' } }, 'api')
    ).resolves.not.toThrow();
  });
});
