import { beforeEach, describe, expect, it, vi } from 'vitest';
import { xApiClient, XApiClient } from './x.client.js';
import { buildUserByHandleResponse } from './x.fixtures.js';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

describe('XApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserByHandle', () => {
    it('returns user data for a valid handle', async () => {
      const client = new XApiClient('https://api.twitter.com/2', 'test-token');
      const fixture = buildUserByHandleResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
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
        json: async () => buildUserByHandleResponse({ username: 'test user' }),
      });

      await xApiClient.getUserByHandle('test user');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/by/username/test%20user?user.fields=public_metrics'),
        expect.anything(),
      );
    });

    it('throws BadGatewayError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          title: 'Too Many Requests',
          detail: 'Rate limit exceeded',
          status: 429,
        }),
      });

      await expect(xApiClient.getUserByHandle('creator123')).rejects.toThrow(
        'Rate limit exceeded',
      );
    });

    it('throws BadGatewayError on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      await expect(xApiClient.getUserByHandle('creator123')).rejects.toThrow(
        'X API request failed',
      );
    });

    it('throws BadGatewayError with generic message when response body is not JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('invalid json');
        },
      });

      await expect(xApiClient.getUserByHandle('creator123')).rejects.toThrow(
        'X API returned status 500',
      );
    });

    it('does not send Authorization header when no bearer token is configured', async () => {
      const clientWithoutToken = new XApiClient('https://api.twitter.com/2', undefined);

      mockFetch.mockResolvedValueOnce({
        ok: true,
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
});
