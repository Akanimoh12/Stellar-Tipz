import type { NextFunction, Request, Response } from 'express';
import { redis } from '../../db/redis.js';
import { logger } from '../utils/logger.js';
import { TooManyRequestsError } from '../errors/AppError.js';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  methods?: string[];
  skip?: (req: Request) => boolean;
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
    // cross-test pollution via shared Redis state.
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    if (
      (finalConfig.methods && !finalConfig.methods.includes(req.method)) ||
      finalConfig.skip?.(req)
    ) {
      return next();
    }

    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const identity = (req as Record<string, any>).auth?.userId ?? (req as Record<string, any>).user?.id;
      const subject = identity ? `user:${identity}` : `ip:${ip}`;
      const key = `${finalConfig.keyPrefix}${subject}`;
      const now = Date.now();
      const windowStart = now - finalConfig.windowMs;

      const count = await redis.zcount(key, windowStart, now);
      const reset = String(Math.ceil((windowStart + finalConfig.windowMs) / 1000));
      const remaining = String(Math.max(0, finalConfig.maxRequests - count - 1));

      // Standard and legacy RateLimit headers
      res.set('RateLimit-Limit', String(finalConfig.maxRequests));
      res.set('RateLimit-Remaining', remaining);
      res.set('RateLimit-Reset', reset);
      res.set('X-RateLimit-Limit', String(finalConfig.maxRequests));
      res.set('X-RateLimit-Remaining', remaining);
      res.set('X-RateLimit-Reset', reset);

      if (count >= finalConfig.maxRequests) {
        logger.warn({ subject, count, limit: finalConfig.maxRequests }, 'Rate limit exceeded');
        return next(new TooManyRequestsError('Rate limit exceeded'));
      }

      await redis.zadd(key, now, `${now}-${Math.random()}`);
      await redis.expire(key, Math.ceil(finalConfig.windowMs / 1000));

      next();
    } catch (error) {
      logger.error({ error }, 'Rate limiter error');
      next(error);
    }
  };
}

export const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 1000,
  keyPrefix: 'rl:global:',
  skip: (req) => req.path === '/health' || req.path.endsWith('/health'),
});

export const mutationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  keyPrefix: 'rl:mutation:',
  methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  skip: (req) => req.path === '/health' || req.path.endsWith('/health'),
});

export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'rl:auth:',
});

export const ipfsUploadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'rl:ipfs-upload:',
});

export const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  keyPrefix: 'rl:search:',
});