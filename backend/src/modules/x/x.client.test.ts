import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { xApiClient, XApiClient } from './x.client.js';
import { buildUserByHandleResponse, buildRateLimitHeaders, buildRetryAfterHeaders } from './x.fixtures.js';
import { CircuitBreaker, xCircuitBreaker } from './x.circuit-breaker.js';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

function mockGetUserByHandleError(status: number, detail: string, count = 4) {
  for (let i = 0; i < count; i++) {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      headers: new Headers(),
      json: async () => ({ title: 'Error', detail, status }),
    });
  }
}

describe('XApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    xCircuitBreaker.reset();
  });

  afterEach(() => {
    xCircuitBreaker.reset();
  });

  describe('getUserByHandle', () => {
    it('returns user data for a valid handle', async () => {
      const client = new XApiClient('https://api.twitter.com/2', 'test-token');
      const fixture = buildUserByHandleResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => fixture,
      });

      const result = await client.getUserByHandle('creator123');

      expect(result).toEqual(fixture);
      expect(result.data.username).toBe('creator123');
      expect(result.data.public_metrics.followers_count).toBe(1500);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.twitter.com/2/users/by/username/creator123?user.fields=public_metrics',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders.Authorization).toBe('Bearer test-token');
    });

    it('encodes the handle in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => buildUserByHandleResponse({ username: 'test user' }),
      });

      await xApiClient.getUserByHandle('test user');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/by/username/test%20user?user.fields=public_metrics'),
        expect.anything(),
      );
    });

    it('throws BadGatewayError on non-ok response', async () => {
      mockGetUserByHandleError(400, 'Bad Request');

      await expect(xApiClient.getUserByHandle('creator123')).rejects.toThrow(
        'Bad Request',
      );
    });

    it('throws BadGatewayError on network failure', async () => {
      for (let i = 0; i < 4; i++) {
        mockFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
      }

      await expect(xApiClient.getUserByHandle('creator123')).rejects.toThrow(
        'X API request failed',
      );
    });

    it('throws BadGatewayError with generic message when response body is not JSON', async () => {
      mockGetUserByHandleError(500, 'X API returned status 500');

      await expect(xApiClient.getUserByHandle('creator123')).rejects.toThrow(
        'X API returned status 500',
      );
    });

    it('does not send Authorization header when no bearer token is configured', async () => {
      const clientWithoutToken = new XApiClient('https://api.twitter.com/2', undefined);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => buildUserByHandleResponse(),
      });

      const result = await clientWithoutToken.getUserByHandle('creator123');

      expect(result.data.username).toBe('creator123');
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders.Authorization).toBeUndefined();
    });
  });

  describe('getUserById', () => {
    it('returns user data for a valid id', async () => {
      const fixture = buildUserByHandleResponse({ id: '987654321' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => fixture,
      });

      const result = await xApiClient.getUserById('987654321');

      expect(result.data.id).toBe('987654321');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.twitter.com/2/users/987654321?user.fields=public_metrics',
        expect.anything(),
      );
    });
  });

  describe('rate limit handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('retries with backoff on 429 and succeeds on retry', async () => {
      const client = new XApiClient('https://api.twitter.com/2', 'test-token');
      const fixture = buildUserByHandleResponse();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: buildRetryAfterHeaders(1),
          json: async () => ({
            title: 'Too Many Requests',
            detail: 'Rate limit exceeded',
            status: 429,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
          json: async () => fixture,
        });

      const promise = client.getUserByHandle('creator123');

      await vi.advanceTimersByTimeAsync(2_000);

      const result = await promise;
      expect(result.data.username).toBe('creator123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries up to maxRetries and throws on persistent 429', async () => {
      vi.useRealTimers();
      const client = new XApiClient('https://api.twitter.com/2', 'test-token');

      for (let i = 0; i < 4; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: buildRetryAfterHeaders(0),
          json: async () => ({
            title: 'Too Many Requests',
            detail: 'Rate limit exceeded',
            status: 429,
          }),
        });
      }

      await expect(client.getUserByHandle('creator123')).rejects.toThrow(
        'Rate limit exceeded',
      );
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('logs warning when rate limit remaining is 0', async () => {
      const client = new XApiClient('https://api.twitter.com/2', 'test-token');
      const fixture = buildUserByHandleResponse();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: buildRateLimitHeaders(0),
        json: async () => fixture,
      });

      const result = await client.getUserByHandle('creator123');
      expect(result.data.username).toBe('creator123');
    });
  });

  describe('circuit breaker', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('opens after threshold failures and fast-fails', async () => {
      const cb = new CircuitBreaker(3, 60_000);
      const client = new XApiClient('https://api.twitter.com/2', 'test-token', cb);

      for (let i = 0; i < 3; i++) {
        mockGetUserByHandleError(500, 'X API returned status 500');
      }

      for (let i = 0; i < 3; i++) {
        await expect(client.getUserByHandle('creator123')).rejects.toThrow(
          'X API returned status 500',
        );
        if (i < 2) {
          await vi.advanceTimersByTimeAsync(3_000);
        }
      }

      expect(cb.getState()).toBe('OPEN');

      await expect(client.getUserByHandle('creator123')).rejects.toThrow(
        'circuit breaker is open',
      );
    });

    it('transitions to HALF_OPEN after reset timeout', async () => {
      const cb = new CircuitBreaker(3, 10_000);
      const client = new XApiClient('https://api.twitter.com/2', 'test-token', cb);

      for (let i = 0; i < 3; i++) {
        mockGetUserByHandleError(500, 'error');
      }

      for (let i = 0; i < 3; i++) {
        await expect(client.getUserByHandle('creator123')).rejects.toThrow();
        if (i < 2) {
          await vi.advanceTimersByTimeAsync(3_000);
        }
      }

      expect(cb.getState()).toBe('OPEN');

      vi.advanceTimersByTime(10_000);

      mockGetUserByHandleError(500, 'error');

      await expect(client.getUserByHandle('creator123')).rejects.toThrow('error');
      expect(cb.getState()).toBe('OPEN');
    });

    it('closes after successful call in HALF_OPEN', async () => {
      const cb = new CircuitBreaker(3, 10_000);
      const client = new XApiClient('https://api.twitter.com/2', 'test-token', cb);

      for (let i = 0; i < 3; i++) {
        mockGetUserByHandleError(500, 'error');
      }

      for (let i = 0; i < 3; i++) {
        await expect(client.getUserByHandle('creator123')).rejects.toThrow();
        if (i < 2) {
          await vi.advanceTimersByTimeAsync(3_000);
        }
      }

      expect(cb.getState()).toBe('OPEN');

      vi.advanceTimersByTime(10_000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => buildUserByHandleResponse(),
      });

      const result = await client.getUserByHandle('creator123');
      expect(result.data.username).toBe('creator123');
      expect(cb.getState()).toBe('CLOSED');
    });

    it('transitions back to OPEN after failure in HALF_OPEN', async () => {
      const cb = new CircuitBreaker(3, 10_000);
      const client = new XApiClient('https://api.twitter.com/2', 'test-token', cb);

      for (let i = 0; i < 3; i++) {
        mockGetUserByHandleError(500, 'error');
      }

      for (let i = 0; i < 3; i++) {
        await expect(client.getUserByHandle('creator123')).rejects.toThrow();
        if (i < 2) {
          await vi.advanceTimersByTimeAsync(3_000);
        }
      }

      expect(cb.getState()).toBe('OPEN');

      vi.advanceTimersByTime(10_000);

      mockGetUserByHandleError(500, 'circuit breaker should re-open');

      await expect(client.getUserByHandle('creator123')).rejects.toThrow();
      expect(cb.getState()).toBe('OPEN');
    });
  });
});
