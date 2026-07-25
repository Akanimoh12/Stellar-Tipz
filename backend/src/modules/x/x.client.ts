import { config } from '../../config/index.js';
import { BadGatewayError } from '../../common/errors/AppError.js';
import { logger } from '../../common/utils/logger.js';

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

const BASE_URL = config.twitter.baseUrl;
const BEARER_TOKEN = config.twitter.bearerToken;

export class XApiClient {
  private readonly baseUrl: string;
  private readonly bearerToken: string | undefined;

  constructor(baseUrl: string, bearerToken: string | undefined) {
    this.baseUrl = baseUrl;
    this.bearerToken = bearerToken;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}),
      ...(options?.headers as Record<string, string> | undefined),
    };

    logger.debug({ url }, 'X API request');

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err) {
      logger.error({ err, url }, 'X API network error');
      throw new BadGatewayError(`X API request failed: ${(err as Error).message}`);
    }

    if (!response.ok) {
      let errorBody: XApiErrorResponse | null = null;
      try {
        errorBody = (await response.json()) as XApiErrorResponse;
      } catch {
        // ignore parse error
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

  async getUserByHandle(handle: string): Promise<XApiUserByHandleResponse> {
    const path = `/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics`;
    return this.request<XApiUserByHandleResponse>(path, {
      signal: AbortSignal.timeout(10_000),
    });
  }

  async getUserById(id: string): Promise<XApiUserByHandleResponse> {
    const path = `/users/${encodeURIComponent(id)}?user.fields=public_metrics`;
    return this.request<XApiUserByHandleResponse>(path, {
      signal: AbortSignal.timeout(10_000),
    });
  }
}

export const xApiClient = new XApiClient(BASE_URL, BEARER_TOKEN);
