import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureException, getValidAccessToken, loggerError, refreshTokens, requestMock } =
  vi.hoisted(() => ({
    captureException: vi.fn(),
    getValidAccessToken: vi.fn<() => Promise<string | null>>(),
    loggerError: vi.fn(),
    refreshTokens: vi.fn<() => Promise<boolean>>(),
    requestMock: vi.fn(),
  }));

vi.mock('@stellar-tipz/sdk', () => ({
  Configuration: vi.fn(function MockConfiguration() {}),
  ApiClient: vi.fn(function MockApiClient() {
    return { request: requestMock };
  }),
}));

vi.mock('@sentry/react', () => ({ captureException }));

vi.mock('../../auth/tokenManager', () => ({
  getValidAccessToken,
  refreshTokens,
}));

vi.mock('../../logger', () => ({
  logger: { error: loggerError },
}));

import { createSdkClient, SdkError, withSdkError } from '../sdk-client';

function sdkApiError(status: number): Error {
  const error = new Error('Request failed');
  error.name = 'ApiError';
  Object.defineProperty(error, 'status', { value: status });
  return error;
}

describe('sdk-client error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getValidAccessToken.mockResolvedValue('token');
  });

  it('refreshes the session and retries a 401 response', async () => {
    requestMock
      .mockRejectedValueOnce(sdkApiError(401))
      .mockResolvedValueOnce({ ok: true });
    refreshTokens.mockResolvedValue(true);

    const client = createSdkClient();

    await expect(
      client.request({ url: '/profiles', method: 'GET' } as never),
    ).resolves.toEqual({ ok: true });
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it('throws a typed error when a session cannot be refreshed', async () => {
    const original = sdkApiError(401);
    requestMock.mockRejectedValue(original);
    refreshTokens.mockResolvedValue(false);

    const client = createSdkClient();

    await expect(
      client.request({ url: '/profiles', method: 'GET' } as never),
    ).rejects.toMatchObject({
      name: 'SdkError',
      message: 'Session expired. Please log in again.',
      originalError: original,
    });
  });

  it('reports non-401 API errors to Sentry', async () => {
    const original = sdkApiError(500);
    requestMock.mockRejectedValue(original);

    const client = createSdkClient();

    await expect(
      client.request({ url: '/profiles', method: 'GET' } as never),
    ).rejects.toBe(original);
    expect(captureException).toHaveBeenCalledWith(
      original,
      expect.objectContaining({ tags: expect.objectContaining({ type: 'api_error' }) }),
    );
  });

  it('wraps thrown errors in SdkError with typed context', async () => {
    const original = new Error('boom');

    await expect(
      withSdkError(async () => {
        throw original;
      }, 'load profiles'),
    ).rejects.toMatchObject({
      name: 'SdkError',
      message: 'load profiles: boom',
      context: 'load profiles',
      originalError: original,
    });
    expect(loggerError).toHaveBeenCalledWith(
      'services/api/sdk-client',
      'SDK API error',
      { context: 'load profiles' },
      original,
    );
  });

  it('exposes SdkError as an Error instance', () => {
    const original = new Error('root cause');
    const error = new SdkError('wrapped', { originalError: original });

    expect(error).toBeInstanceOf(Error);
    expect(error.cause).toBe(original);
    expect(error.originalError).toBe(original);
  });
});
