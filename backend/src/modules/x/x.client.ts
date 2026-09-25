import { config } from '../../config/index.js';
import { BadGatewayError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';
import { xCircuitBreaker, type CircuitBreaker } from './x.circuit-breaker.js';
import { fetchWithTimeout } from '../../common/utils/fetchWithTimeout.js';

export interface XApiUser {
  id: string;
  name: string;
  username: string;
  public_metrics: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
}

export interface XApiUserByHandleResponse {
  data: XApiUser;
}

export interface XApiErrorResponse {
  title: string;
  detail: string;
  type?: string;
  status?: number;
}

export interface XRateLimitInfo {
  remaining: number | null;
  reset: number | null;
  limit: number | null;
}

const BASE_URL = (config as unknown as { twitter?: { baseUrl: string } })?.twitter?.baseUrl ?? 'https://api.twitter.com/2';
const BEARER_TOKEN = (config as unknown as { twitter?: { bearerToken?: string } })?.twitter?.bearerToken;

export class XApiClient {
  private readonly baseUrl: string;
  private readonly bearerToken: string | undefined;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1_000;
  private readonly maxDelayMs = 30_000;

  constructor(
    baseUrl: string,
    bearerToken: string | undefined,
    circuitBreaker?: CircuitBreaker,
  ) {
    this.baseUrl = baseUrl;
    this.bearerToken = bearerToken;
    this.circuitBreaker = circuitBreaker ?? xCircuitBreaker;
  }

  private parseRateLimitHeaders(headers: Headers): XRateLimitInfo {
    const remaining = headers.get('x-rate-limit-remaining');
    const reset = headers.get('x-rate-limit-reset');
    const limit = headers.get('x-rate-limit-limit');
    return {
      remaining: remaining !== null ? parseInt(remaining, 10) : null,
      reset: reset !== null ? parseInt(reset, 10) : null,
      limit: limit !== null ? parseInt(limit, 10) : null,
    };
  }

  private computeBackoffDelay(
    attempt: number,
    responseHeaders?: Headers,
  ): number {
    if (responseHeaders) {
      const retryAfter = responseHeaders.get('retry-after');
      if (retryAfter) {
        return parseInt(retryAfter, 10) * 1000;
      }
      const reset = responseHeaders.get('x-rate-limit-reset');
      if (reset) {
        const resetMs = parseInt(reset, 10) * 1000;
        const wait = resetMs - Date.now();
        if (wait > 0) {
          return wait + 1_000;
        }
      }
    }
    const jitter = Math.random() * 1_000;
    return Math.min(this.baseDelayMs * Math.pow(2, attempt) + jitter, this.maxDelayMs);
  }

  private async request<T>(
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    return this.circuitBreaker.call(async () => {
      let lastError: unknown;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          return await this.executeRequest<T>(path, options, attempt);
        } catch (err) {
          lastError = err;
          if (attempt < this.maxRetries) {
            continue;
          }
          throw err;
        }
      }

      throw lastError;
    });
  }

  private async executeRequest<T>(
    path: string,
    options: RequestInit & { parentSignal?: AbortSignal } | undefined,
    attempt: number,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}),
      ...(options?.headers as Record<string, string> | undefined),
    };

    logger.debug({ url, attempt: attempt + 1 }, 'X API request');

    // Timeouts are explicit and configurable (issue #090); parentSignal carries client-disconnect cancellation
    const timeoutMs = (config as unknown as { timeouts?: { xApiMs: number } })?.timeouts?.xApiMs ?? 10_000;
    const parentSignal = (options as unknown as { parentSignal?: AbortSignal })?.parentSignal;
    const explicitSignal = (options as unknown as { signal?: AbortSignal })?.signal;

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        ...options,
        headers,
        timeoutMs,
        parentSignal: parentSignal ?? explicitSignal ?? undefined,
        // Remove explicit signal to avoid duplication — fetchWithTimeout merges them
        signal: undefined,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        logger.warn({ url, timeoutMs }, 'X API request timed out');
        throw new BadGatewayError(`X API request timed out after ${timeoutMs}ms`);
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        logger.debug({ url }, 'X API request aborted (client disconnect)');
        throw new BadGatewayError('X API request cancelled');
      }
      logger.error({ err, url }, 'X API network error');
      throw new BadGatewayError(
        `X API request failed: ${(err as Error).message}`,
      );
    }

    const rateLimit = this.parseRateLimitHeaders(response.headers);
    if (rateLimit.remaining !== null && rateLimit.remaining <= 1) {
      logger.warn(
        { remaining: rateLimit.remaining, reset: rateLimit.reset },
        'X API rate limit nearly exhausted',
      );
    }

    if (!response.ok) {
      let errorBody: XApiErrorResponse | null = null;
      try {
        errorBody = (await response.json()) as XApiErrorResponse;
      } catch {
        // ignore parse error
      }

      if (response.status === 429 && attempt < this.maxRetries) {
        const delay = this.computeBackoffDelay(attempt, response.headers);
        logger.warn(
          { delay, attempt: attempt + 1, maxRetries: this.maxRetries },
          'X API rate limited, retrying with backoff',
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        throw new BadGatewayError(
          errorBody?.detail ?? 'X API rate limit exceeded',
        );
      }

      logger.warn(
        { status: response.status, url, errorBody },
        'X API returned an error',
      );
      throw new BadGatewayError(
        errorBody?.detail ?? `X API returned status ${response.status}`,
      );
    }

    const body = (await response.json()) as T;
    return body;
  }

  async getUserByHandle(handle: string, opts: { signal?: AbortSignal } = {}): Promise<XApiUserByHandleResponse> {
    const path = `/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics`;
    return this.request<XApiUserByHandleResponse>(path, {
      parentSignal: opts.signal,
    } as RequestInit & { parentSignal?: AbortSignal });
  }

  async getUserById(id: string, opts: { signal?: AbortSignal } = {}): Promise<XApiUserByHandleResponse> {
    const path = `/users/${encodeURIComponent(id)}?user.fields=public_metrics`;
    return this.request<XApiUserByHandleResponse>(path, {
      parentSignal: opts.signal,
    } as RequestInit & { parentSignal?: AbortSignal });
  }
}

export const xApiClient = new XApiClient(BASE_URL, BEARER_TOKEN);
