import { Request, Response, NextFunction } from "express";
import { redis } from "../../db/redis.js";
import { logger } from "../../common/utils/logger.js";
import { TooManyRequestsError } from "../../common/errors/AppError.js";
import { env } from "../../config/env.js";

/**
 * Auth-specific rate limiter that enforces both per-IP and per-Stellar-address
 * limits on the challenge and verify endpoints. This prevents:
 *
 * - Brute-force signature guessing (per-IP limit)
 * - Targeted attacks on a single address (per-address limit)
 * - Distributed attacks across IPs targeting one address (per-address limit)
 *
 * Uses Redis sorted sets with sliding-window counters, identical to the global
 * rate limiter but with dual keys.
 */

function getIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function getAddressFromBody(req: Request): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body.stellarAddress === "string" && body.stellarAddress.length > 0) {
    return body.stellarAddress;
  }
  return undefined;
}

async function checkAndIncrement(
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;

  const count = await redis.zcount(key, windowStart, now);

  if (count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, Math.ceil(windowMs / 1000));

  return { allowed: true, remaining: maxRequests - count - 1 };
}

/**
 * Creates middleware that rate-limits auth endpoints by both IP and Stellar address.
 *
 * @param options.windowMs - Sliding window duration (default: from env)
 * @param options.maxPerIp - Max requests per IP per window (default: from env)
 * @param options.maxPerAddress - Max requests per address per window (default: from env)
 */
export function createAuthRateLimiter(options?: {
  windowMs?: number;
  maxPerIp?: number;
  maxPerAddress?: number;
}) {
  const windowMs = options?.windowMs ?? env.AUTH_RATE_LIMIT_WINDOW_MS;
  const maxPerIp = options?.maxPerIp ?? env.AUTH_RATE_LIMIT_PER_IP;
  const maxPerAddress = options?.maxPerAddress ?? env.AUTH_RATE_LIMIT_PER_ADDRESS;

  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ip = getIp(req);
      const address = getAddressFromBody(req);

      // 1. Check per-IP limit
      const ipKey = `rl:auth:ip:${ip}`;
      const ipCheck = await checkAndIncrement(ipKey, windowMs, maxPerIp);

      if (!ipCheck.allowed) {
        logger.warn({ ip }, "Auth rate limit exceeded (per-IP)");
        return next(new TooManyRequestsError("Rate limit exceeded"));
      }

      // 2. Check per-address limit (if address is available in the request)
      if (address) {
        const addrKey = `rl:auth:addr:${address}`;
        const addrCheck = await checkAndIncrement(addrKey, windowMs, maxPerAddress);

        if (!addrCheck.allowed) {
          logger.warn({ address }, "Auth rate limit exceeded (per-address)");
          return next(new TooManyRequestsError("Rate limit exceeded"));
        }

        _res.set("X-RateLimit-Address-Remaining", String(addrCheck.remaining));
      }

      _res.set("X-RateLimit-Limit", String(maxPerIp));
      _res.set("X-RateLimit-Remaining", String(ipCheck.remaining));

      next();
    } catch (error) {
      logger.error({ error }, "Auth rate limiter error");
      next(error);
    }
  };
}

/**
 * Pre-configured auth rate limiter using env defaults.
 * Applied to POST /auth/challenge and POST /auth/verify.
 */
export const authRateLimiter = createAuthRateLimiter();
