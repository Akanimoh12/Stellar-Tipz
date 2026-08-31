import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { createRateLimiter } from './rateLimiter.js';
import { redis } from '../../db/redis.js';

vi.mock('../../db/redis.js', () => ({
  redis: {
    zcount: vi.fn(),
    zadd: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('createRateLimiter (issue #1044)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows requests within the limit', async () => {
    const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60000 });
    const req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    const res = { set: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    vi.mocked(redis.zcount).mockResolvedValueOnce(5);
    vi.mocked(redis.zadd).mockResolvedValueOnce(1 as never);
    vi.mocked(redis.expire).mockResolvedValueOnce(1 as never);

    await limiter(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(redis.zadd).toHaveBeenCalled();
  });

  it('rejects requests exceeding the limit', async () => {
    const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60000 });
    const req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    const res = { set: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    vi.mocked(redis.zcount).mockResolvedValueOnce(10);

    await limiter(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    expect(redis.zadd).not.toHaveBeenCalled();
  });

  it('sets rate limit headers on response', async () => {
    const limiter = createRateLimiter({ maxRequests: 10 });
    const req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    const res = { set: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    vi.mocked(redis.zcount).mockResolvedValueOnce(3);
    vi.mocked(redis.zadd).mockResolvedValueOnce(1 as never);
    vi.mocked(redis.expire).mockResolvedValueOnce(1 as never);

    await limiter(req, res, next);

    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '6');
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    expect(res.set).toHaveBeenCalledWith('RateLimit-Limit', '10');
    expect(res.set).toHaveBeenCalledWith('RateLimit-Remaining', '6');
    expect(res.set).toHaveBeenCalledWith('RateLimit-Reset', expect.any(String));
  });

  it('uses client IP for rate limiting key', async () => {
    const limiter = createRateLimiter({ maxRequests: 10 });
    const req = {
      ip: '192.168.1.1',
      socket: { remoteAddress: '192.168.1.1' },
    } as unknown as Request;
    const res = { set: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    vi.mocked(redis.zcount).mockResolvedValueOnce(0);
    vi.mocked(redis.zadd).mockResolvedValueOnce(1 as never);
    vi.mocked(redis.expire).mockResolvedValueOnce(1 as never);

    await limiter(req, res, next);

    expect(redis.zcount).toHaveBeenCalledWith(
      expect.stringContaining('rl:ip:192.168.1.1'),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('keys authenticated requests by user instead of IP', async () => {
    const limiter = createRateLimiter({ maxRequests: 10 });
    const req = {
      ip: '192.168.1.1',
      socket: { remoteAddress: '192.168.1.1' },
      auth: { userId: 'user-123' },
    } as unknown as Request;
    const res = { set: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    vi.mocked(redis.zcount).mockResolvedValueOnce(0);
    vi.mocked(redis.zadd).mockResolvedValueOnce(1 as never);
    vi.mocked(redis.expire).mockResolvedValueOnce(1 as never);

    await limiter(req, res, next);

    expect(redis.zcount).toHaveBeenCalledWith(
      expect.stringContaining('rl:user:user-123'),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('skips configured requests without touching Redis', async () => {
    const limiter = createRateLimiter({ skip: (request) => request.path === '/health' });
    const req = {
      path: '/health',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    const res = { set: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await limiter(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(redis.zcount).not.toHaveBeenCalled();
  });

  it('handles Redis errors gracefully', async () => {
    const limiter = createRateLimiter();
    const req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    const res = { set: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    const error = new Error('Redis connection failed');
    vi.mocked(redis.zcount).mockRejectedValueOnce(error);

    await limiter(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
