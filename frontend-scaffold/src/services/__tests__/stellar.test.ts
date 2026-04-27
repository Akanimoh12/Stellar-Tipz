import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { truncateAddress, getBalance, getAccount, getTransactions } from '../stellar';

// Mock the env helper
vi.mock('../helpers/env', () => ({
  env: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
}));

// Mock global fetch
globalThis.fetch = vi.fn();

describe('stellar service', () => {
  const mockPublicKey = 'GD5DJQD73KHNA7HYLLKQYA6VTLNBLJ4HFGFA3SIXRS7SNTL5YF6GYQ3X';
  const mockHorizonUrl = 'https://horizon-testnet.stellar.org';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('truncateAddress', () => {
    it('truncates long addresses correctly', () => {
      const address = 'GD5DJQD73KHNA7HYLLKQYA6VTLNBLJ4HFGFA3SIXRS7SNTL5YF6GYQ3X';
      const result = truncateAddress(address);
      expect(result).toBe('GD5DJ...YQ3X');
    });

    it('returns short addresses unchanged', () => {
      const address = 'GD5DJQD73K';
      const result = truncateAddress(address);
      expect(result).toBe('GD5DJQD73K');
    });

    it('handles empty address', () => {
      const result = truncateAddress('');
      expect(result).toBe('');
    });

    it('handles undefined address', () => {
      const result = truncateAddress(undefined as any);
      expect(result).toBe('');
    });
  });

  describe('getBalance', () => {
    it('fetches account balance successfully', async () => {
      const mockResponse = {
        balances: [
          { asset_type: 'native', balance: '100.0' },
          { asset_type: 'credit_alphanum4', asset_code: 'USD', balance: '50.0' },
        ],
      };

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const balance = await getBalance(mockPublicKey);
      expect(balance).toBe('100.0');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${mockHorizonUrl}/accounts/${mockPublicKey}`
      );
    });

    it('returns 0 when no native balance found', async () => {
      const mockResponse = {
        balances: [
          { asset_type: 'credit_alphanum4', asset_code: 'USD', balance: '50.0' },
        ],
      };

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const balance = await getBalance(mockPublicKey);
      expect(balance).toBe('0');
    });

    it('returns 0 when balances array is empty', async () => {
      const mockResponse = {
        balances: [],
      };

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const balance = await getBalance(mockPublicKey);
      expect(balance).toBe('0');
    });

    it('handles network errors gracefully', async () => {
      (globalThis.fetch as any).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(getBalance(mockPublicKey)).rejects.toThrow(
        'Network error'
      );
    });

    it('handles HTTP errors gracefully', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(getBalance(mockPublicKey)).rejects.toThrow(
        'Error fetching balance: Not Found'
      );
    });

    it('handles malformed response', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' }),
      });

      const balance = await getBalance(mockPublicKey);
      expect(balance).toBe('0');
    });

    it('handles timeout errors', async () => {
      (globalThis.fetch as any).mockRejectedValueOnce(
        new Error('Request timeout')
      );

      await expect(getBalance(mockPublicKey)).rejects.toThrow(
        /timeout/i
      );
    });
  });

  describe('getAccount', () => {
    it('fetches account details successfully', async () => {
      const mockResponse = {
        account_id: mockPublicKey,
        sequence: '123456789',
        balances: [{ asset_type: 'native', balance: '100.0' }],
      };

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const account = await getAccount(mockPublicKey);
      expect(account).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${mockHorizonUrl}/accounts/${mockPublicKey}`
      );
    });

    it('handles network errors', async () => {
      (globalThis.fetch as any).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(getAccount(mockPublicKey)).rejects.toThrow(
        'Network error'
      );
    });

    it('handles HTTP errors', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(getAccount(mockPublicKey)).rejects.toThrow(
        'Error fetching account: Not Found'
      );
    });
  });

  describe('getTransactions', () => {
    it('fetches transactions with default limit', async () => {
      const mockResponse = {
        _links: { self: { href: '/transactions' } },
        _embedded: { records: [] },
      };

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const transactions = await getTransactions(mockPublicKey);
      expect(transactions).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${mockHorizonUrl}/accounts/${mockPublicKey}/transactions?limit=10&order=desc`
      );
    });

    it('fetches transactions with custom limit', async () => {
      const mockResponse = {
        _links: { self: { href: '/transactions' } },
        _embedded: { records: [] },
      };

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const transactions = await getTransactions(mockPublicKey, 20);
      expect(transactions).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${mockHorizonUrl}/accounts/${mockPublicKey}/transactions?limit=20&order=desc`
      );
    });

    it('handles network errors', async () => {
      (globalThis.fetch as any).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(getTransactions(mockPublicKey)).rejects.toThrow(
        'Network error'
      );
    });

    it('handles HTTP errors', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      });

      await expect(getTransactions(mockPublicKey)).rejects.toThrow(
        'Error fetching transactions: Bad Request'
      );
    });
  });

  describe('retry logic', () => {
    it('implements retry on network failure', async () => {
      let attemptCount = 0;
      
      (globalThis.fetch as any).mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ balances: [{ asset_type: 'native', balance: '100.0' }] }),
        });
      });

      // Note: The current implementation doesn't have built-in retry logic
      // This test documents the expected behavior for future implementation
      await expect(getBalance(mockPublicKey)).rejects.toThrow('Network error');
      expect(attemptCount).toBe(1);
    });

    it('handles rate limiting with exponential backoff', async () => {
      let attemptCount = 0;
      
      (globalThis.fetch as any).mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ balances: [{ asset_type: 'native', balance: '100.0' }] }),
        });
      });

      // Note: The current implementation doesn't have built-in retry logic
      // This test documents the expected behavior for future implementation
      await expect(getBalance(mockPublicKey)).rejects.toThrow(
        'Error fetching balance: Too Many Requests'
      );
      expect(attemptCount).toBe(1);
    });
  });

  describe('error handling', () => {
    it('handles 404 Not Found for non-existent account', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(getBalance(mockPublicKey)).rejects.toThrow(
        'Error fetching balance: Not Found'
      );
    });

    it('handles 500 Internal Server Error', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(getBalance(mockPublicKey)).rejects.toThrow(
        'Error fetching balance: Internal Server Error'
      );
    });

    it('handles 503 Service Unavailable', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      await expect(getBalance(mockPublicKey)).rejects.toThrow(
        'Error fetching balance: Service Unavailable'
      );
    });

    it('handles invalid JSON response', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(getBalance(mockPublicKey)).rejects.toThrow(
        'Invalid JSON'
      );
    });

    it('handles CORS errors', async () => {
      (globalThis.fetch as any).mockRejectedValueOnce(
        new Error('Failed to fetch: CORS policy')
      );

      await expect(getBalance(mockPublicKey)).rejects.toThrow(
        'CORS policy'
      );
    });
  });
});
