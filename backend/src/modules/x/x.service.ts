import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../common/utils/logger.js";
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../common/errors/AppError.js";
import type {
  XAccountMetrics,
  XApiUserResponse,
  FetchXMetricsOptions,
} from "./x.types.js";

/**
 * X API client for fetching user metrics.
 */
class XApiClient {
  private baseUrl: string;
  private bearerToken?: string;

  constructor() {
    this.baseUrl = env.X_API_BASE_URL;
    this.bearerToken = env.X_API_BEARER_TOKEN;
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

    const url = `${this.baseUrl}/users/by/username/${handle}?user.fields=public_metrics`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.bearerToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new NotFoundError(`X user @${handle} not found`);
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
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ServiceUnavailableError ||
        error instanceof BadRequestError
      ) {
        throw error;
      }
      logger.error({ error, handle }, "Failed to fetch X user data");
      throw new ServiceUnavailableError("Failed to connect to X API");
    }
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
