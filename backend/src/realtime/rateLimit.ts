import type { Socket } from 'socket.io';
import { logger } from '../common/utils/logger.js';
import type { ServerToClientEvents } from './types.js';

interface Window {
  count: number;
  resetAt: number;
}

/** Fixed-window rate limiter keyed by an arbitrary string (IP, socket id, ...). */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, Window>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Records one hit for `key`; returns false once `max` is exceeded within the window. */
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

  /** Drops expired entries so the map doesn't grow unbounded. */
  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now >= entry.resetAt) this.hits.delete(key);
    }
  }
}

/** Throttles new socket connections per client IP. */
export const connectionLimiter = new SlidingWindowLimiter(20, 60_000);

/** Throttles client->server events per connected socket. */
export const eventLimiter = new SlidingWindowLimiter(30, 10_000);

/** Socket.IO handshake middleware rejecting connections once the per-IP limit is hit. */
export function connectionRateLimit(socket: Socket, next: (err?: Error) => void): void {
  const ip = socket.handshake.address;

  if (!connectionLimiter.consume(ip)) {
    logger.warn({ ip, socketId: socket.id }, 'Socket connection rate limited');
    next(new Error('Too many connection attempts, please try again later'));
    return;
  }

  next();
}

/**
 * Call at the top of every client event handler. Returns false (and notifies
 * the client) once the socket has exceeded its per-window event budget.
 */
export function guardEventRate(socket: Socket<object, ServerToClientEvents>): boolean {
  if (!eventLimiter.consume(socket.id)) {
    logger.warn({ socketId: socket.id }, 'Socket event rate limited');
    socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many requests, slow down' });
    return false;
  }

  return true;
}
