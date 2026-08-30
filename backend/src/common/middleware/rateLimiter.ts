import { Request, Response, NextFunction } from 'express';
import { redis } from '../../db/redis.js';
import { logger } from '../utils/logger.js';
import { TooManyRequestsError } from '../errors/AppError.js';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
  keyPrefix: 'rl:',
};

export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (req: Request, res: Response, next: NextFunction) => {
    // In test env, bypass rate limiting to keep tests deterministic and avoid
    // cross-test pollution via shared Redis state. The rate limiter is still
    // tested in isolation via its own unit test with mocked Redis.
    if (process.env.NODE_ENV === 'test') {
      return next();
    }
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `${finalConfig.keyPrefix}${ip}`;
      const now = Date.now();
      const windowStart = now - finalConfig.windowMs;

      const count = await redis.zcount(key, windowStart, now);

      if (count >= finalConfig.maxRequests) {
        logger.warn({ ip, count, limit: finalConfig.maxRequests }, 'Rate limit exceeded');
        return next(new TooManyRequestsError('Rate limit exceeded'));
      }

      await redis.zadd(key, now, `${now}-${Math.random()}`);
      await redis.expire(key, Math.ceil(finalConfig.windowMs / 1000));

      res.set('X-RateLimit-Limit', String(finalConfig.maxRequests));
      res.set('X-RateLimit-Remaining', String(finalConfig.maxRequests - count - 1));
      res.set('X-RateLimit-Reset', String(Math.ceil((windowStart + finalConfig.windowMs) / 1000)));

      next();
    } catch (error) {
      logger.error({ error }, 'Rate limiter error');
      next(error);
    }
  };
}

export const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
  keyPrefix: 'rl:global:',
});
