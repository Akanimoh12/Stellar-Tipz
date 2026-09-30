import { describe, it, expect, beforeEach, vi } from 'vitest';
import { secureStorage, clearClientStorageOnLogout } from '../secureStorage';

describe('SecureStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.clear();
    vi.useFakeTimers();
  });

  it('encrypts data before storing', async () => {
    await secureStorage.set('wallet', 'GA...');
    const raw = localStorage.getItem('tipz_wallet');
    
    // If crypto is available in the test env, it should be encrypted.
    // If not, it falls back to memory storage, and localStorage will be empty.
    if (typeof window.crypto !== 'undefined' && typeof window.crypto.subtle !== 'undefined') {
        expect(raw).not.toBeNull();
        expect(raw).not.toBe('GA...');
        const parsed = JSON.parse(raw!);
        expect(parsed).toHaveProperty('iv');
        expect(parsed).toHaveProperty('data');
    }
  });

  it('decrypts data on retrieval', async () => {
    const value = { address: 'GA...', network: 'TESTNET' };
    await secureStorage.set('wallet', value);
    const retrieved = await secureStorage.get('wallet');
    expect(retrieved).toEqual(value);
  });

  it('returns null for tampered data', async () => {
    await secureStorage.set('wallet', 'GA...');
    localStorage.setItem('tipz_wallet', 'tampered');
    const retrieved = await secureStorage.get('wallet');
    expect(retrieved).toBeNull();
  });

  it('cleans up expired entries', async () => {
    await secureStorage.set('temp', 'value', { ttl: 1000 });
    
    // Simulate time passing
    vi.advanceTimersByTime(2000);
    
    const retrieved = await secureStorage.get('temp');
    expect(retrieved).toBeNull();
  });

  it('discards stale unversioned or mismatched shapes', async () => {
    // Unversioned payload
    localStorage.setItem('tipz_stale', JSON.stringify({ iv: 'abc', data: 'def', expiry: null }));
    const result = await secureStorage.get('stale');
    expect(result).toBeNull();
    expect(localStorage.getItem('tipz_stale')).toBeNull();
  });

  it('clears all sensitive client storage on logout', () => {
    localStorage.setItem('tipz_auth_tokens', '{"accessToken":"abc","refreshToken":"def"}');
    localStorage.setItem('tipz_notifications', '[]');
    localStorage.setItem('tipz_draft_form', '{"username":"bob"}');
    sessionStorage.setItem('tipz_recent_searches', '["stellar"]');

    clearClientStorageOnLogout();

    expect(localStorage.getItem('tipz_auth_tokens')).toBeNull();
    expect(localStorage.getItem('tipz_notifications')).toBeNull();
    expect(localStorage.getItem('tipz_draft_form')).toBeNull();
    expect(sessionStorage.getItem('tipz_recent_searches')).toBeNull();
  });
});
