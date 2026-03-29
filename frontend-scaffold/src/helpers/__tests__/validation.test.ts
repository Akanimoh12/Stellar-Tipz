import { describe, it, expect } from 'vitest';
import { validateUsername, validateDisplayName, validateBio } from '../validation';

describe('validateUsername', () => {
  it('should accept valid usernames', () => {
    const validUsernames = ['alice', 'bob_123', 'creator_x'];
    
    validUsernames.forEach(username => {
      const result = validateUsername(username);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  it('should reject usernames that are too short', () => {
    const result = validateUsername('ab');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Username must be 3-32 characters long.');
  });

  it('should reject usernames that contain uppercase letters', () => {
    const result = validateUsername('ABC');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Username must start with a letter and contain only lowercase letters, numbers, or underscores.');
  });

  it('should reject usernames that start with a digit', () => {
    const result = validateUsername('1abc');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Username must start with a letter and contain only lowercase letters, numbers, or underscores.');
  });

  it('should reject usernames with consecutive underscores', () => {
    const result = validateUsername('a__b');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Username cannot contain consecutive underscores.');
  });

  it('should reject usernames that end with underscore', () => {
    const result = validateUsername('abc_');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Username cannot end with an underscore.');
  });

  it('should reject usernames that are too long', () => {
    const result = validateUsername('a'.repeat(33));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Username must be 3-32 characters long.');
  });

  it('should handle whitespace properly', () => {
    const result = validateUsername('  alice  ');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject empty username', () => {
    const result = validateUsername('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Username must be 3-32 characters long.');
  });
});

describe('validateDisplayName', () => {
  it('should accept valid display names', () => {
    const validNames = ['Alice', 'Bob Smith', 'Creator X', 'A', 'A'.repeat(64)];
    
    validNames.forEach(name => {
      const result = validateDisplayName(name);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  it('should reject empty display name', () => {
    const result = validateDisplayName('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Display name must be 1-64 characters.');
  });

  it('should reject display name that is too long', () => {
    const result = validateDisplayName('A'.repeat(65));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Display name must be 1-64 characters.');
  });

  it('should handle whitespace properly', () => {
    const result = validateDisplayName('  Alice Smith  ');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject display name with only whitespace', () => {
    const result = validateDisplayName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Display name must be 1-64 characters.');
  });
});

describe('validateBio', () => {
  it('should accept valid bios', () => {
    const validBios = [
      '',
      'Short bio',
      'This is a longer bio that is still within the character limit.',
      'A'.repeat(280)
    ];
    
    validBios.forEach(bio => {
      const result = validateBio(bio);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  it('should reject bio that is too long', () => {
    const result = validateBio('A'.repeat(281));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Bio must be 280 characters or fewer.');
  });

  it('should accept exactly 280 characters', () => {
    const result = validateBio('A'.repeat(280));
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should handle empty bio', () => {
    const result = validateBio('');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
