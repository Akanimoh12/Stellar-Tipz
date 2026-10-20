# X (Twitter) Integration Module

This module provides integration with the X (formerly Twitter) API to fetch and cache user metrics such as follower counts and engagement scores.

## Features

- Fetch X account metrics (followers, engagement) from X API v2
- Cache metrics in PostgreSQL for performance and fallback
- Graceful degradation when X API is unavailable
- Configurable cache expiration
- Rate limit handling
- Comprehensive error handling

## Setup

### Required Environment Variables

Add these to your `.env` file:

```env
X_API_BEARER_TOKEN=your_twitter_bearer_token_here
X_API_BASE_URL=https://api.twitter.com/2
```

### Getting X API Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new App or use an existing one
3. Navigate to "Keys and tokens"
4. Generate a "Bearer Token"
5. Copy the token to your `.env` file as `X_API_BEARER_TOKEN`

### Required Scopes

The X API Bearer Token needs the following scopes:

- `users.read` - Read user profile information
- `tweet.read` - Read tweet metrics (for engagement calculation)

## API Endpoints

### GET `/api/v1/x/metrics/:handle`

Fetches fresh X metrics with optional fallback to cached data.

**Parameters:**

- `handle` (path) - X handle without @ symbol (e.g., "elonmusk")
- `useFallback` (query, optional) - Whether to use cached data if API fails (default: true)
- `maxCacheAge` (query, optional) - Max age of cached data in milliseconds (default: 86400000 = 24h)

**Response:**

```json
{
  "handle": "elonmusk",
  "followers": 150000000,
  "engagement": 0.45,
  "fetchedAt": "2024-01-15T10:30:00.000Z"
}
```

**Errors:**

- `404 Not Found` - X user not found
- `429 Too Many Requests` - Rate limit exceeded
- `503 Service Unavailable` - X API is down (and no fallback available)

### GET `/api/v1/x/cached/:handle`

Retrieves cached metrics without calling the X API.

**Parameters:**

- `handle` (path) - X handle without @ symbol

**Response:**

```json
{
  "handle": "elonmusk",
  "followers": 149500000,
  "engagement": 0.44,
  "fetchedAt": "2024-01-14T15:20:00.000Z"
}
```

**Errors:**

- `404 Not Found` - No cached data available

## Service Functions

### `fetchXMetrics(handle, options)`

Fetches X metrics with graceful degradation.

```typescript
import { fetchXMetrics } from "./modules/x/x.service.js";

const metrics = await fetchXMetrics("elonmusk", {
  useFallback: true,
  maxCacheAge: 24 * 60 * 60 * 1000, // 24 hours
});
```

**Options:**

- `useFallback` (boolean) - Use cached data when API fails (default: true)
- `maxCacheAge` (number) - Max cache age in milliseconds (default: 24h)

### `getCachedXMetrics(handle)`

Gets cached metrics without calling the API.

```typescript
import { getCachedXMetrics } from "./modules/x/x.service.js";

const cached = await getCachedXMetrics("elonmusk");
if (cached) {
  console.log(`Cached followers: ${cached.followers}`);
}
```

### `clearCachedXMetrics(handle)`

Clears cached metrics for a handle.

```typescript
import { clearCachedXMetrics } from "./modules/x/x.service.js";

await clearCachedXMetrics("elonmusk");
```

## Engagement Calculation

The engagement score is calculated as:

```
engagement = tweet_count / followers_count
```

This provides a simple ratio indicating how active the account is relative to their follower base. A higher score indicates more frequent posting.

**Examples:**

- 10,000 tweets / 10,000 followers = 1.0 (very active)
- 5,000 tweets / 10,000 followers = 0.5 (moderately active)
- 1,000 tweets / 100,000 followers = 0.01 (low activity relative to reach)

## Graceful Degradation

When the X API is unavailable (503 errors, network issues, rate limits), the module automatically falls back to cached data:

1. **Fresh data attempt**: Try to fetch from X API
2. **Cache check**: If API fails, check database for cached data
3. **Age validation**: Ensure cached data is within `maxCacheAge`
4. **Fallback response**: Return cached data with original `fetchedAt` timestamp
5. **Error propagation**: If no valid cache, throw ServiceUnavailableError

This ensures the application remains functional even when X API is down.

## Error Handling

The module uses AppError subclasses:

- `NotFoundError` - X user doesn't exist
- `BadRequestError` - Invalid handle format or API error
- `ServiceUnavailableError` - X API down, rate limited, or token missing

## Database Schema

The module uses the `XAccount` model:

```prisma
model XAccount {
  id         String   @id @default(cuid())
  handle     String   @unique
  followers  Int      @default(0)
  engagement Float?
  fetchedAt  DateTime @default(now())
}
```

## Testing

All tests use mocked API responses (no real network calls):

```bash
npm test -- x.test.ts
```

Test coverage includes:

- Fresh metrics fetching and caching
- Engagement calculation
- Fallback to cached data
- Rate limit handling
- API error scenarios
- Cache expiration
- Stale data rejection

## Rate Limiting

X API v2 has rate limits:

- Bearer Token: 300 requests per 15 minutes per app

The module handles rate limits by:

1. Throwing `ServiceUnavailableError` when rate limited
2. Falling back to cached data (if enabled)
3. Logging rate limit events

## Best Practices

1. **Enable fallback in production**: Set `useFallback: true` for better reliability
2. **Adjust cache age**: Use shorter `maxCacheAge` for real-time needs, longer for cost savings
3. **Monitor API health**: Track ServiceUnavailableError frequency
4. **Batch updates**: Pre-fetch metrics for multiple users during off-peak hours
5. **Graceful UI**: Show cache age to users when displaying fallback data

## Future Enhancements

- More sophisticated engagement metrics (likes, retweets, replies)
- Batch fetching for multiple handles
- Background refresh jobs for popular accounts
- Circuit breaker pattern for API failures
- Metrics history and trend analysis
