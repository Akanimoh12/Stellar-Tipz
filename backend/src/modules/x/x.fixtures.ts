import type { XApiUserByHandleResponse } from './x.client.js';

export function buildUserByHandleResponse(
  overrides?: Partial<XApiUserByHandleResponse['data']>,
): XApiUserByHandleResponse {
  return {
    data: {
      id: '12345678901234567890',
      name: 'Test Creator',
      username: 'creator123',
      public_metrics: {
        followers_count: 1500,
        following_count: 200,
        tweet_count: 500,
        listed_count: 10,
      },
      ...overrides,
    },
  };
}

export function buildRateLimitHeaders(
  remaining = 0,
  reset = Math.floor(Date.now() / 1000) + 900,
  limit = 300,
): Headers {
  const headers = new Headers();
  headers.set('x-rate-limit-remaining', String(remaining));
  headers.set('x-rate-limit-reset', String(reset));
  headers.set('x-rate-limit-limit', String(limit));
  return headers;
}

export function buildRetryAfterHeaders(seconds = 60): Headers {
  const headers = new Headers();
  headers.set('retry-after', String(seconds));
  return headers;
}
