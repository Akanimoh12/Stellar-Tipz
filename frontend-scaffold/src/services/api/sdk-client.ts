/**
 * Stellar Tipz API Client - Generated SDK Wrapper
 *
 * This module provides a configured instance of the generated Stellar Tipz SDK,
 * with automatic authentication and error handling integrated.
 *
 * The underlying SDK is auto-generated from the OpenAPI spec in backend/openapi-generated.json.
 * Do not edit the SDK directly; instead, regenerate it using scripts/generate-sdk.sh after
 * modifying the backend API.
 *
 * Usage:
 *   const profiles = await client.profiles.getProfileByUsername('alice');
 *   const tips = await client.tips.listTips({ limit: 50 });
 */

import { Configuration, ApiClient } from '@stellar-tipz/sdk';
import * as Sentry from '@sentry/react';
import { getValidAccessToken, refreshTokens } from './auth.js';
import logger from '../logger.js';

// ────────────────────────────────────────────────────────────────────────────

/**
 * Create an authenticated API configuration.
 */
function createApiConfiguration(): Configuration {
  const baseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

  return new Configuration({
    basePath: `${baseUrl}/api/v1`,
    // Token provider function called for each request
    accessToken: async () => {
      const token = await getValidAccessToken();
      return token || '';
    },
    apiKey: async () => {
      // Fallback for API key auth if needed
      return process.env.REACT_APP_API_KEY || '';
    },
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': `StellarTipzFrontend/${process.env.REACT_APP_VERSION || '1.0.0'}`,
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Create an instance of the generated API client with error handling.
 */
export function createSdkClient(): ApiClient {
  const config = createApiConfiguration();
  const client = new ApiClient(config);

  // Wrap request interceptor to handle 401 and refresh tokens
  const originalRequest = client.request.bind(client);
  client.request = async function (requestContext) {
    try {
      return await originalRequest(requestContext);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name === 'ApiError' &&
        (error as any).status === 401
      ) {
        // Try to refresh tokens and retry
        const refreshed = await refreshTokens();
        if (refreshed) {
          // Retry the original request with new token
          const newConfig = createApiConfiguration();
          const newClient = new ApiClient(newConfig);
          return await newClient.request(requestContext);
        }

        throw new Error('Session expired. Please log in again.');
      }

      // Log to Sentry for tracking
      if (error instanceof Error) {
        Sentry.captureException(error, {
          tags: {
            type: 'api_error',
            endpoint: requestContext.url,
            method: requestContext.method,
          },
        });
      }

      throw error;
    }
  };

  return client;
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Global SDK client instance, lazily initialized.
 */
let sdkClientInstance: ApiClient | null = null;

export function getSdkClient(): ApiClient {
  if (!sdkClientInstance) {
    sdkClientInstance = createSdkClient();
  }
  return sdkClientInstance;
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Reset the SDK client (useful for testing or after logout).
 */
export function resetSdkClient(): void {
  sdkClientInstance = null;
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Type-safe API calls with automatic error handling.
 *
 * Usage:
 *   const profiles = await withSdkError(() =>
 *     getSdkClient().profiles.getProfileByUsername('alice')
 *   );
 */
export async function withSdkError<T>(
  fn: () => Promise<T>,
  context?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error) {
      logger.error('SDK API error', {
        context,
        error: error.message,
        stack: error.stack,
      });

      // Re-throw with context
      const err = new Error(`${context}: ${error.message}`);
      (err as any).originalError = error;
      throw err;
    }

    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Export all API classes from the generated SDK for convenience.
 *
 * Example: import { ProfilesApi } from './sdk-client';
 */
export * from '@stellar-tipz/sdk';
