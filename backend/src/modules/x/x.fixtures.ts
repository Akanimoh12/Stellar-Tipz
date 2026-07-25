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
