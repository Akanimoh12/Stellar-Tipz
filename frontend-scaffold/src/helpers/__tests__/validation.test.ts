import { describe, expect, it } from 'vitest';

import {
  MAX_MESSAGE_LENGTH,
  validateBio,
  validateDisplayName,
  validateMessage,
  validateUsername,
  validateXHandle,
} from '../validation';

describe('validation helpers', () => {
  it('rejects usernames with spaces', () => {
    expect(validateUsername('has space').valid).toBe(false);
  });

  it('accepts valid username', () => {
    expect(validateUsername('alice123')).toEqual({ valid: true });
  });

  it('rejects username edge cases', () => {
    expect(validateUsername('ab').valid).toBe(false);
    expect(validateUsername('abc_').error).toBe('Username cannot end with an underscore.');
    expect(validateUsername('a__b').error).toBe('Username cannot contain consecutive underscores.');
  });

  it('validates display names with trimming rules', () => {
    expect(validateDisplayName('  Alice Smith  ').valid).toBe(true);
    expect(validateDisplayName('   ').valid).toBe(false);
    expect(validateDisplayName('A'.repeat(65)).valid).toBe(false);
  });

  it('validates bio boundaries', () => {
    expect(validateBio('')).toEqual({ valid: true });
    expect(validateBio('A'.repeat(280))).toEqual({ valid: true });
    expect(validateBio('A'.repeat(281))).toEqual({
      valid: false,
      error: 'Bio must be 280 characters or fewer.',
    });
  });



  it('validates X handle rules', () => {
    expect(validateXHandle('')).toEqual({ valid: false, error: 'X handle cannot be empty.' });
    expect(validateXHandle('a'.repeat(17))).toEqual({
      valid: false,
      error: 'X handle must be 16 characters or fewer.',
    });
    expect(validateXHandle('@bad-handle').valid).toBe(false);
    expect(validateXHandle('@').valid).toBe(false);
    expect(validateXHandle('@alice_123')).toEqual({ valid: true });
  });

  it('validates message boundaries', () => {
    expect(validateMessage('hello')).toEqual({ valid: true });
    expect(validateMessage('A'.repeat(MAX_MESSAGE_LENGTH))).toEqual({ valid: true });
    expect(validateMessage('A'.repeat(MAX_MESSAGE_LENGTH + 1))).toEqual({
      valid: false,
      error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
    });
  });
});
