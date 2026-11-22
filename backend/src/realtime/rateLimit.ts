/**
 * Real-time rate limiting for Socket.IO connections and events.
 *
 * Implements per-IP and per-user connection limits, per-socket event limits,
 * violation tracking, and temporary bans. Uses WeakMap for type-safe
 * per-socket metadata instead of casting to `any`.
 *
 * @module realtime/rateLimit
 */

import type { Socket } from 'socket.io';
import { logger } from '../common/utils/logger.js';
import { redis } from '../db/redis.js';
import { config } from '../config/index.js';
import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended } from './types.js';

/** Rate limit configuration shape */
export interface RateLimitConfig {
  /** Max new connections per IP per window */
  connectionLimitPerIp: number;
  /** Window in milliseconds for IP connection limit */
  connectionWindowMs: number;
  /** Max concurrent connections per authenticated user */
  connectionLimitPerUser: number;
  /** Window in milliseconds for user connection limit */
  userConnectionWindowMs: number;
  /** Max events per socket per window */
  eventLimitPerSocket: number;
  /** Window in milliseconds for event limit */
  eventWindowMs: number;
  /** Violations before temporary ban */
  maxViolationsBeforeBan: number;
  /** Window in milliseconds for violation counting */
  violationWindowMs: number;
  /** Ban duration in milliseconds */
  banDurationMs: number;
}

/** Default rate limit configuration */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  connectionLimitPerIp: 20,
  connectionWindowMs: 60_000,
  connectionLimitPerUser: 10,
  userConnectionWindowMs: 60_000,
  eventLimitPerSocket: 30,
  eventWindowMs: 10_000,
  maxViolationsBeforeBan: 5,
  violationWindowMs: 60_000,
  banDurationMs: 60_000,
};

let activeConfig: RateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG };

/** Get current rate limit configuration */
export function getRateLimitConfig(): RateLimitConfig {
  return activeConfig;
}

/** Update rate limit configuration at runtime (e.g., via admin API) */
export function setRateLimitConfig(overrides: Partial<RateLimitConfig>): void {
  activeConfig = { ...activeConfig, ...overrides };
  // Update in-memory limiter configs
  connectionLimiter.updateConfig(activeConfig.connectionLimitPerIp, activeConfig.connectionWindowMs);
  userConnectionLimiter.updateConfig(activeConfig.connectionLimitPerUser, activeConfig.userConnectionWindowMs);
  eventLimiter.updateConfig(activeConfig.eventLimitPerSocket, activeConfig.eventWindowMs);
}

/** Reset to defaults */
export function resetRateLimitConfig(): void {
  activeConfig = { ...DEFAULT_RATE_LIMIT_CONFIG };
  connectionLimiter.updateConfig(activeConfig.connectionLimitPerIp, activeConfig.connectionWindowMs);
  userConnectionLimiter.updateConfig(activeConfig.connectionLimitPerUser, activeConfig.userConnectionWindowMs);
  eventLimiter.updateConfig(activeConfig.eventLimitPerSocket, activeConfig.eventWindowMs);
}

/** Internal window entry for fixed-window limiter */
interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter keyed by arbitrary string (IP, socket ID, user ID).
 * Not thread-safe across processes — use Redis-backed limiter for multi-instance.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, WindowEntry>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** Update limit parameters at runtime */
  updateConfig(max: number, windowMs: number): void {
    this.max = max;
    this.windowMs = windowMs;
  }

  /**
   * Record one hit for `key`; returns false once `max` is exceeded within the window.
   */
  consume(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || now >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.max) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  /** Remove expired entries to prevent unbounded growth */
  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now >= entry.resetAt) this.hits.delete(key);
    }
  }

  /** Clear all entries (for testing) */
  clear(): void {
    this.hits.clear();
  }
}

/** Redis-backed sliding-window rate limiter using sorted sets */
export class RedisSlidingWindowLimiter {
  constructor(
    private readonly keyPrefix: string,
    private readonly getLimit: () => { max: number; windowMs: number },
    private readonly redisClient = redis,
  ) {}

  async consume(key: string): Promise<boolean> {
    const { max, windowMs } = this.getLimit();
    const fullKey = `${this.keyPrefix}${key}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Remove expired entries
      await this.redisClient.zRemRangeByScore(fullKey, 0, windowStart);
      const count = await this.redisClient.zCard(fullKey);

      if (count >= max) {
        return false;
      }

      // Add current request with timestamp as score
      await this.redisClient.zAdd(fullKey, { score: now, value: `${now}-${Math.random()}` });
      await this.redisClient.pExpire(fullKey, windowMs);
      return true;
    } catch (err) {
      logger.error({ err, key: fullKey }, 'RedisSlidingWindowLimiter error; failing open');
      return true; // Fail open to avoid blocking legitimate traffic on Redis issues
    }
  }

  async clear(key: string): Promise<void> {
    await this.redisClient.del(`${this.keyPrefix}${key}`);
  }
}

// In-memory instances (used directly or when Redis adapter is disabled)
export const connectionLimiter = new SlidingWindowLimiter(
  DEFAULT_RATE_LIMIT_CONFIG.connectionLimitPerIp,
  DEFAULT_RATE_LIMIT_CONFIG.connectionWindowMs,
);

export const userConnectionLimiter = new SlidingWindowLimiter(
  DEFAULT_RATE_LIMIT_CONFIG.connectionLimitPerUser,
  DEFAULT_RATE_LIMIT_CONFIG.userConnectionWindowMs,
);

export const eventLimiter = new SlidingWindowLimiter(
  DEFAULT_RATE_LIMIT_CONFIG.eventLimitPerSocket,
  DEFAULT_RATE_LIMIT_CONFIG.eventWindowMs,
);

// Redis-backed instances
export const redisConnectionLimiter = new RedisSlidingWindowLimiter('rl:rt:conn:ip:', () => ({
  max: activeConfig.connectionLimitPerIp,
  windowMs: activeConfig.connectionWindowMs,
}));

export const redisUserConnectionLimiter = new RedisSlidingWindowLimiter('rl:rt:conn:user:', () => ({
  max: activeConfig.connectionLimitPerUser,
  windowMs: activeConfig.userConnectionWindowMs,
}));

export const redisEventLimiter = new RedisSlidingWindowLimiter('rl:rt:event:', () => ({
  max: activeConfig.eventLimitPerSocket,
  windowMs: activeConfig.eventWindowMs,
}));

// In-memory ban and violation tracking
const inMemoryBans = new Map<string, number>();
const inMemoryViolations = new Map<string, { count: number; resetAt: number }>();

/** WeakMap to store per-socket rate limit tick without extending Socket type or using `any` */
/** @internal */
const socketRateLimitTicks = new WeakMap<Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended>, number>();

/** Check if Redis-backed rate limiting is enabled */
export function isRedisBacked(): boolean {
  return Boolean(config.realtime?.redisAdapterEnabled);
}

/** Check if an IP or user is currently banned */
export async function isBanned(target: { ip?: string; userId?: string }): Promise<boolean> {
  const now = Date.now();
  const keysToCheck: string[] = [];
  if (target.ip) keysToCheck.push(`ip:${target.ip}`);
  if (target.userId) keysToCheck.push(`user:${target.userId}`);

  if (isRedisBacked()) {
    try {
      for (const k of keysToCheck) {
        const exists = await redis.exists(`rl:rt:ban:${k}`);
        if (exists === 1) return true;
      }
      return false;
    } catch (err) {
      logger.error({ err }, 'Redis isBanned check error; falling back to in-memory check');
    }
  }

  for (const k of keysToCheck) {
    const bannedUntil = inMemoryBans.get(k);
    if (bannedUntil && now < bannedUntil) return true;
    if (bannedUntil && now >= bannedUntil) inMemoryBans.delete(k);
  }
  return false;
}

/** Ban an IP and/or user for a duration */
export async function banTarget(
  target: { ip?: string; userId?: string },
  durationMs = activeConfig.banDurationMs,
): Promise<void> {
  const now = Date.now();
  const keysToBan: string[] = [];
  if (target.ip) keysToBan.push(`ip:${target.ip}`);
  if (target.userId) keysToBan.push(`user:${target.userId}`);

  if (isRedisBacked()) {
    try {
      for (const k of keysToBan) {
        await redis.set(`rl:rt:ban:${k}`, '1', 'PX', durationMs);
      }
    } catch (err) {
      logger.error({ err }, 'Redis banTarget error');
    }
  }

  for (const k of keysToBan) {
    inMemoryBans.set(k, now + durationMs);
  }
}

/** Record a rate limit violation for a socket; returns true if ban threshold reached */
export async function recordViolation(socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended>): Promise<boolean> {
  const ip = socket.handshake.address;
  const userId = socket.data?.auth?.userId;
  const violKey = userId ? `user:${userId}` : `ip:${ip}`;
  const now = Date.now();

  if (isRedisBacked()) {
    try {
      const fullKey = `rl:rt:viol:${violKey}`;
      const count = await redis.incr(fullKey);
      if (count === 1) {
        await redis.pExpire(fullKey, activeConfig.violationWindowMs);
      }
      if (count >= activeConfig.maxViolationsBeforeBan) {
        await banTarget({ ip, userId }, activeConfig.banDurationMs);
        return true;
      }
      return false;
    } catch (err) {
      logger.error({ err }, 'Redis recordViolation error; falling back to memory');
    }
  }

  let entry = inMemoryViolations.get(violKey);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + activeConfig.violationWindowMs };
    inMemoryViolations.set(violKey, entry);
  } else {
    entry.count += 1;
  }

  if (entry.count >= activeConfig.maxViolationsBeforeBan) {
    await banTarget({ ip, userId }, activeConfig.banDurationMs);
    return true;
  }

  return false;
}

/** Consume a connection slot for an IP */
export async function consumeConnection(ip: string): Promise<boolean> {
  if (isRedisBacked()) {
    return redisConnectionLimiter.consume(ip);
  }
  return connectionLimiter.consume(ip);
}

/** Consume a connection slot for a user */
export async function consumeUserConnection(userId: string): Promise<boolean> {
  if (isRedisBacked()) {
    return redisUserConnectionLimiter.consume(userId);
  }
  return userConnectionLimiter.consume(userId);
}

/** Consume an event slot for a socket (keyed by user ID or socket ID) */
export async function consumeEvent(socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended>): Promise<boolean> {
  const userId = socket.data?.auth?.userId;
  const key = userId ? `user:${userId}` : `sock:${socket.id}`;

  if (isRedisBacked()) {
    return redisEventLimiter.consume(key);
  }
  return eventLimiter.consume(socket.id);
}

/**
 * Socket.IO handshake middleware: rejects connections once per-IP limit is hit or IP is banned.
 */
export async function connectionRateLimit(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended>,
  next: (err?: Error) => void,
): Promise<void> {
  const ip = socket.handshake.address;

  if (await isBanned({ ip })) {
    logger.warn({ ip, socketId: socket.id }, 'Banned IP connection rejected');
    next(new Error('Temporarily banned due to rate limit violations'));
    return;
  }

  if (!(await consumeConnection(ip))) {
    logger.warn({ ip, socketId: socket.id }, 'Socket connection rate limited by IP');
    next(new Error('Too many connection attempts, please try again later'));
    return;
  }

  next();
}

/**
 * Socket.IO handshake middleware: rejects connections once per-user limit is hit or user is banned.
 */
export async function userConnectionRateLimit(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended>,
  next: (err?: Error) => void,
): Promise<void> {
  const userId = socket.data?.auth?.userId;
  if (!userId) {
    return next();
  }

  if (await isBanned({ userId })) {
    logger.warn({ userId, socketId: socket.id }, 'Banned user connection rejected');
    next(new Error('Temporarily banned due to rate limit violations'));
    return;
  }

  if (!(await consumeUserConnection(userId))) {
    logger.warn({ userId, socketId: socket.id }, 'Socket connection rate limited by user');
    next(new Error('Too many connections for this user, please try again later'));
    return;
  }

  next();
}

/**
 * Attach per-event rate limiter middleware to a socket.
 * Stores the last allowed event timestamp in a WeakMap for type safety.
 */
export function attachPacketRateLimiter(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended>,
): void {
  socket.use(async ([event], next) => {
    if (socket.disconnected) return;

    const ip = socket.handshake.address;
    const userId = socket.data?.auth?.userId;

    if (await isBanned({ ip, userId })) {
      logger.warn(
        { socketId: socket.id, ip, userId },
        'Dropping event from banned client and disconnecting',
      );
      socket.emit('error', {
        code: 'BANNED',
        message: 'Temporarily banned due to repeated rate limit violations',
      });
      socket.disconnect(true);
      return;
    }

    const allowed = await consumeEvent(socket);
    if (!allowed) {
      logger.warn({ socketId: socket.id, event, ip, userId }, 'Socket event rate limited');
      const isNowBanned = await recordViolation(socket);

      if (isNowBanned) {
        logger.warn(
          { socketId: socket.id, ip, userId },
          'Client exceeded violation threshold; banning and disconnecting',
        );
        socket.emit('error', {
          code: 'BANNED',
          message: 'Temporarily banned due to repeated rate limit violations',
        });
        socket.disconnect(true);
      } else {
        socket.emit('error', {
          code: 'RATE_LIMITED',
          message: 'Too many requests, slow down',
        });
      }
      return;
    }

    // Store rate limit tick in WeakMap (type-safe, no `any` cast)
    socketRateLimitTicks.set(socket, Date.now());
    next();
  });
}

/**
 * Synchronous guard for event handlers.
 * Returns false (and notifies client) once the socket has exceeded its per-window event budget.
 * Uses WeakMap to retrieve the last allowed event timestamp.
 */
export function guardEventRate(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended>,
): boolean {
  const lastTick = socketRateLimitTicks.get(socket);
  const now = Date.now();

  // Allow burst within 50ms of last allowed event (coalesces rapid identical events)
  if (lastTick !== undefined && now - lastTick < 50) {
    return true;
  }

  if (!eventLimiter.consume(socket.id)) {
    logger.warn({ socketId: socket.id }, 'Socket event rate limited (sync guard)');
    socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many requests, slow down' });
    return false;
  }

  // Update tick in WeakMap
  socketRateLimitTicks.set(socket, now);
  return true;
}

/** Periodic cleanup of in-memory limiter state */
export function sweepRateLimiter(): void {
  connectionLimiter.sweep();
  userConnectionLimiter.sweep();
  eventLimiter.sweep();

  const now = Date.now();
  for (const [key, resetAt] of inMemoryBans) {
    if (now >= resetAt) inMemoryBans.delete(key);
  }
  for (const [key, entry] of inMemoryViolations) {
    if (now >= entry.resetAt) inMemoryViolations.delete(key);
  }
}

/** Clear all rate limiter state (for testing) */
export function clearRateLimits(): void {
  connectionLimiter.clear();
  userConnectionLimiter.clear();
  eventLimiter.clear();
  inMemoryBans.clear();
  inMemoryViolations.clear();
  // Note: WeakMap cannot be cleared externally; entries are GC'd with sockets
  resetRateLimitConfig();
}
