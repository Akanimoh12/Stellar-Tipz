import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../common/utils/logger.js";
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../common/errors/AppError.js";
import { xCircuitBreaker } from "./x.circuit-breaker.js";
import type {
  XAccountMetrics,
  XApiUserResponse,
  FetchXMetricsOptions,
} from "./x.types.js";

/**
 * X API client for fetching user metrics with rate limit handling,
 * exponential backoff retry, and circuit breaker.
 */
class XApiClient {
  private baseUrl: string;
  private bearerToken?: string;
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1_000;
  private readonly maxDelayMs = 30_000;

  constructor() {
    this.baseUrl = env.X_API_BASE_URL;
    this.bearerToken = env.X_API_BEARER_TOKEN;
  }

  private computeBackoffDelay(
    attempt: number,
    responseHeaders?: Headers,
  ): number {
    if (responseHeaders) {
      const retryAfter = responseHeaders.get("retry-after");
      if (retryAfter) {
        return parseInt(retryAfter, 10) * 1000;
      }
      const reset = responseHeaders.get("x-rate-limit-reset");
      if (reset) {
        const resetMs = parseInt(reset, 10) * 1000;
        const wait = resetMs - Date.now();
        if (wait > 0) {
          return wait + 1_000;
        }
      }
    }
    const jitter = Math.random() * 1_000;
    return Math.min(
      this.baseDelayMs * Math.pow(2, attempt) + jitter,
      this.maxDelayMs,
    );
  }

  /**
   * Fetches user data from X API by handle.
   * @param handle - X handle (without @ symbol)
   * @returns X API user response
   * @throws {ServiceUnavailableError} if API is unavailable or token is missing
   */
  async fetchUserByHandle(handle: string): Promise<XApiUserResponse> {
    if (!this.bearerToken) {
      throw new ServiceUnavailableError("X API bearer token not configured");
    }

    return xCircuitBreaker.call(async () => {
      let lastError: unknown;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          return await this.executeFetch(handle, attempt);
        } catch (error) {
          lastError = error;
          if (
            error instanceof NotFoundError ||
            error instanceof BadRequestError
          ) {
            throw error;
          }
          if (attempt < this.maxRetries) {
            continue;
          }
          throw error;
        }
      }

      throw lastError;
    });
  }

  private async executeFetch(
    handle: string,
    attempt: number,
  ): Promise<XApiUserResponse> {
    const url = `${this.baseUrl}/users/by/username/${handle}?user.fields=public_metrics`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.bearerToken!}`,
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      logger.error({ error, handle }, "Failed to fetch X user data");
      throw new ServiceUnavailableError("Failed to connect to X API");
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundError(`X user @${handle} not found`);
      }
      if (response.status === 429 && attempt < this.maxRetries) {
        const delay = this.computeBackoffDelay(attempt, response.headers);
        logger.warn(
          { delay, attempt: attempt + 1, maxRetries: this.maxRetries },
          "X API rate limited, retrying with backoff",
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        throw new ServiceUnavailableError("X API rate limit exceeded");
      }
      if (response.status === 429) {
        throw new ServiceUnavailableError("X API rate limit exceeded");
      }
      if (response.status >= 500) {
        throw new ServiceUnavailableError("X API is currently unavailable");
      }
      throw new BadRequestError(`X API error: ${response.statusText}`);
    }

    const data = (await response.json()) as XApiUserResponse;
    return data;
  }
}

const xApiClient = new XApiClient();

/**
 * Normalizes X API response to internal metrics format.
 * Calculates engagement score based on followers and tweet activity.
 */
function normalizeXMetrics(
  handle: string,
  apiResponse: XApiUserResponse,
): XAccountMetrics {
  const { public_metrics } = apiResponse.data;

  // Calculate engagement as a simple ratio of tweet_count to followers
  // This is a basic metric - can be enhanced with more sophisticated algorithms
  const engagement =
    public_metrics.followers_count > 0
      ? public_metrics.tweet_count / public_metrics.followers_count
      : 0;

  return {
    handle,
    followers: public_metrics.followers_count,
    engagement: parseFloat(engagement.toFixed(4)),
    fetchedAt: new Date(),
  };
}

/**
 * Fetches X account metrics with graceful degradation.
 * Falls back to cached data if API is unavailable.
 */
export async function fetchXMetrics(
  handle: string,
  options: FetchXMetricsOptions = {},
): Promise<XAccountMetrics> {
  const { useFallback = true, maxCacheAge = 24 * 60 * 60 * 1000 } = options;

  try {
    // Try to fetch fresh data from X API
    const apiResponse = await xApiClient.fetchUserByHandle(handle);
    const metrics = normalizeXMetrics(handle, apiResponse);

    // Cache the result in database
    await prisma.xAccount.upsert({
      where: { handle },
      update: {
        followers: metrics.followers,
        engagement: metrics.engagement,
        fetchedAt: metrics.fetchedAt,
      },
      create: {
        handle,
        followers: metrics.followers,
        engagement: metrics.engagement,
        fetchedAt: metrics.fetchedAt,
      },
    });

    logger.info(
      { handle, followers: metrics.followers },
      "Fetched fresh X metrics",
    );
    return metrics;
  } catch (error) {
    // If API is unavailable and fallback is enabled, try to use cached data
    if (error instanceof ServiceUnavailableError && useFallback) {
      logger.warn(
        { handle, error: (error as Error).message },
        "X API unavailable, attempting fallback",
      );

      const cached = await prisma.xAccount.findUnique({
        where: { handle },
      });

      if (cached) {
        const cacheAge = Date.now() - cached.fetchedAt.getTime();

        if (cacheAge <= maxCacheAge) {
          logger.info(
            { handle, cacheAge: Math.round(cacheAge / 1000 / 60) },
            "Using cached X metrics",
          );

          return {
            handle: cached.handle,
            followers: cached.followers,
            engagement: cached.engagement ?? undefined,
            fetchedAt: cached.fetchedAt,
          };
        }

        logger.warn(
          { handle, cacheAge },
          "Cached data too old, cannot use fallback",
        );
      } else {
        logger.warn({ handle }, "No cached data available for fallback");
      }
    }

    // Re-throw the error if no fallback or fallback failed
    throw error;
  }
}

/**
 * Gets cached X metrics from database without calling API.
 * Useful for displaying last-known data.
 */
export async function getCachedXMetrics(
  handle: string,
): Promise<XAccountMetrics | null> {
  const cached = await prisma.xAccount.findUnique({
    where: { handle },
  });

  if (!cached) {
    return null;
  }

  return {
    handle: cached.handle,
    followers: cached.followers,
    engagement: cached.engagement ?? undefined,
    fetchedAt: cached.fetchedAt,
  };
}

/**
 * Clears cached X metrics for a specific handle.
 * Useful for testing or when forcing a fresh fetch.
 */
export async function clearCachedXMetrics(handle: string): Promise<void> {
  await prisma.xAccount.deleteMany({
    where: { handle },
  });
  logger.info({ handle }, "Cleared cached X metrics");
}
