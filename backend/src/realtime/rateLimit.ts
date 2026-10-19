import type { Socket } from 'socket.io'
import { logger } from '../common/utils/logger.js'
import { redis } from '../db/redis.js'
import { config } from '../config/index.js'
import type { ServerToClientEvents } from './types.js'

export interface RateLimitConfig {
  connectionLimitPerIp: number
  connectionWindowMs: number
  connectionLimitPerUser: number
  userConnectionWindowMs: number
  eventLimitPerSocket: number
  eventWindowMs: number
  maxViolationsBeforeBan: number
  violationWindowMs: number
  banDurationMs: number
}

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
}

let activeConfig: RateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG }

export function getRateLimitConfig(): RateLimitConfig {
  return activeConfig
}

export function setRateLimitConfig(overrides: Partial<RateLimitConfig>): void {
  activeConfig = { ...activeConfig, ...overrides }
}

export function resetRateLimitConfig(): void {
  activeConfig = { ...DEFAULT_RATE_LIMIT_CONFIG }
}

interface Window {
  count: number
  resetAt: number
}

/** Fixed-window rate limiter keyed by an arbitrary string (IP, socket id, ...). */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, Window>()

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  updateConfig(max: number, windowMs: number): void {
    this.max = max
    this.windowMs = windowMs
  }

  /** Records one hit for `key`; returns false once `max` is exceeded within the window. */
  consume(key: string): boolean {
    const now = Date.now()
    const entry = this.hits.get(key)

    if (!entry || now >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }

    if (entry.count >= this.max) {
      return false
    }

    entry.count += 1
    return true
  }

  /** Drops expired entries so the map doesn't grow unbounded. */
  sweep(): void {
    const now = Date.now()
    for (const [key, entry] of this.hits) {
      if (now >= entry.resetAt) this.hits.delete(key)
    }
  }

  clear(): void {
    this.hits.clear()
  }
}

/** Redis-backed sliding-window rate limiter using sorted sets. */
export class RedisSlidingWindowLimiter {
  constructor(
    private readonly keyPrefix: string,
    private readonly getLimit: () => { max: number; windowMs: number },
    private readonly redisClient = redis,
  ) {}

  async consume(key: string): Promise<boolean> {
    const { max, windowMs } = this.getLimit()
    const fullKey = `${this.keyPrefix}${key}`
    const now = Date.now()
    const windowStart = now - windowMs

    try {
      await this.redisClient.zremrangebyscore(fullKey, 0, windowStart)
      const count = await this.redisClient.zcard(fullKey)

      if (count >= max) {
        return false
      }

      await this.redisClient.zadd(fullKey, now, `${now}-${Math.random()}`)
      await this.redisClient.pexpire(fullKey, windowMs)
      return true
    } catch (err) {
      logger.error({ err, key: fullKey }, 'RedisSlidingWindowLimiter error; failing open')
      return true
    }
  }

  async clear(key: string): Promise<void> {
    await this.redisClient.del(`${this.keyPrefix}${key}`)
  }
}

// In-memory instances (used directly or when Redis adapter is disabled)
export const connectionLimiter = new SlidingWindowLimiter(
  DEFAULT_RATE_LIMIT_CONFIG.connectionLimitPerIp,
  DEFAULT_RATE_LIMIT_CONFIG.connectionWindowMs,
)

export const userConnectionLimiter = new SlidingWindowLimiter(
  DEFAULT_RATE_LIMIT_CONFIG.connectionLimitPerUser,
  DEFAULT_RATE_LIMIT_CONFIG.userConnectionWindowMs,
)

export const eventLimiter = new SlidingWindowLimiter(
  DEFAULT_RATE_LIMIT_CONFIG.eventLimitPerSocket,
  DEFAULT_RATE_LIMIT_CONFIG.eventWindowMs,
)

// Redis-backed instances
export const redisConnectionLimiter = new RedisSlidingWindowLimiter('rl:rt:conn:ip:', () => ({
  max: activeConfig.connectionLimitPerIp,
  windowMs: activeConfig.connectionWindowMs,
}))

export const redisUserConnectionLimiter = new RedisSlidingWindowLimiter('rl:rt:conn:user:', () => ({
  max: activeConfig.connectionLimitPerUser,
  windowMs: activeConfig.userConnectionWindowMs,
}))

export const redisEventLimiter = new RedisSlidingWindowLimiter('rl:rt:event:', () => ({
  max: activeConfig.eventLimitPerSocket,
  windowMs: activeConfig.eventWindowMs,
}))

// In-memory ban and violation tracking
const inMemoryBans = new Map<string, number>()
const inMemoryViolations = new Map<string, { count: number; resetAt: number }>()

export function isRedisBacked(): boolean {
  return Boolean(config.realtime.redisAdapterEnabled)
}

export async function isBanned(target: { ip?: string; userId?: string }): Promise<boolean> {
  const now = Date.now()
  const keysToCheck: string[] = []
  if (target.ip) keysToCheck.push(`ip:${target.ip}`)
  if (target.userId) keysToCheck.push(`user:${target.userId}`)

  if (isRedisBacked()) {
    try {
      for (const k of keysToCheck) {
        const exists = await redis.exists(`rl:rt:ban:${k}`)
        if (exists === 1) return true
      }
      return false
    } catch (err) {
      logger.error({ err }, 'Redis isBanned check error; falling back to in-memory check')
    }
  }

  for (const k of keysToCheck) {
    const bannedUntil = inMemoryBans.get(k)
    if (bannedUntil && now < bannedUntil) return true
    if (bannedUntil && now >= bannedUntil) inMemoryBans.delete(k)
  }
  return false
}

export async function banTarget(
  target: { ip?: string; userId?: string },
  durationMs = activeConfig.banDurationMs,
): Promise<void> {
  const now = Date.now()
  const keysToBan: string[] = []
  if (target.ip) keysToBan.push(`ip:${target.ip}`)
  if (target.userId) keysToBan.push(`user:${target.userId}`)

  if (isRedisBacked()) {
    try {
      for (const k of keysToBan) {
        await redis.set(`rl:rt:ban:${k}`, '1', 'PX', durationMs)
      }
    } catch (err) {
      logger.error({ err }, 'Redis banTarget error')
    }
  }

  for (const k of keysToBan) {
    inMemoryBans.set(k, now + durationMs)
  }
}

export async function recordViolation(socket: Socket): Promise<boolean> {
  const ip = socket.handshake.address
  const userId = socket.data?.auth?.userId
  const violKey = userId ? `user:${userId}` : `ip:${ip}`
  const now = Date.now()

  if (isRedisBacked()) {
    try {
      const fullKey = `rl:rt:viol:${violKey}`
      const count = await redis.incr(fullKey)
      if (count === 1) {
        await redis.pexpire(fullKey, activeConfig.violationWindowMs)
      }
      if (count >= activeConfig.maxViolationsBeforeBan) {
        await banTarget({ ip, userId }, activeConfig.banDurationMs)
        return true
      }
      return false
    } catch (err) {
      logger.error({ err }, 'Redis recordViolation error; falling back to memory')
    }
  }

  let entry = inMemoryViolations.get(violKey)
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + activeConfig.violationWindowMs }
    inMemoryViolations.set(violKey, entry)
  } else {
    entry.count += 1
  }

  if (entry.count >= activeConfig.maxViolationsBeforeBan) {
    await banTarget({ ip, userId }, activeConfig.banDurationMs)
    return true
  }

  return false
}

export async function consumeConnection(ip: string): Promise<boolean> {
  if (isRedisBacked()) {
    return redisConnectionLimiter.consume(ip)
  }
  connectionLimiter.updateConfig(activeConfig.connectionLimitPerIp, activeConfig.connectionWindowMs)
  return connectionLimiter.consume(ip)
}

export async function consumeUserConnection(userId: string): Promise<boolean> {
  if (isRedisBacked()) {
    return redisUserConnectionLimiter.consume(userId)
  }
  userConnectionLimiter.updateConfig(
    activeConfig.connectionLimitPerUser,
    activeConfig.userConnectionWindowMs,
  )
  return userConnectionLimiter.consume(userId)
}

export async function consumeEvent(socket: Socket): Promise<boolean> {
  const userId = socket.data?.auth?.userId
  const key = userId ? `user:${userId}` : `sock:${socket.id}`

  if (isRedisBacked()) {
    return redisEventLimiter.consume(key)
  }
  eventLimiter.updateConfig(activeConfig.eventLimitPerSocket, activeConfig.eventWindowMs)
  return eventLimiter.consume(socket.id)
}

/** Socket.IO handshake middleware rejecting connections once the per-IP limit is hit or if IP is banned. */
export async function connectionRateLimit(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  const ip = socket.handshake.address

  if (await isBanned({ ip })) {
    logger.warn({ ip, socketId: socket.id }, 'Banned IP connection rejected')
    next(new Error('Temporarily banned due to rate limit violations'))
    return
  }

  if (!(await consumeConnection(ip))) {
    logger.warn({ ip, socketId: socket.id }, 'Socket connection rate limited by IP')
    next(new Error('Too many connection attempts, please try again later'))
    return
  }

  next()
}

/** Socket.IO handshake middleware rejecting connections once the per-user limit is hit or if user is banned. */
export async function userConnectionRateLimit(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  const userId = socket.data?.auth?.userId
  if (!userId) {
    return next()
  }

  if (await isBanned({ userId })) {
    logger.warn({ userId, socketId: socket.id }, 'Banned user connection rejected')
    next(new Error('Temporarily banned due to rate limit violations'))
    return
  }

  if (!(await consumeUserConnection(userId))) {
    logger.warn({ userId, socketId: socket.id }, 'Socket connection rate limited by user')
    next(new Error('Too many connections for this user, please try again later'))
    return
  }

  next()
}

/**
 * Attaches incoming packet middleware to the socket so every inbound event is rate limited.
 */
export function attachPacketRateLimiter(socket: Socket<any, ServerToClientEvents>): void {
  socket.use(async ([event], next) => {
    if (socket.disconnected) return

    const ip = socket.handshake.address
    const userId = socket.data?.auth?.userId

    if (await isBanned({ ip, userId })) {
      logger.warn(
        { socketId: socket.id, ip, userId },
        'Dropping event from banned client and disconnecting',
      )
      socket.emit('error', {
        code: 'BANNED',
        message: 'Temporarily banned due to repeated rate limit violations',
      })
      socket.disconnect(true)
      return
    }

    const allowed = await consumeEvent(socket)
    if (!allowed) {
      logger.warn({ socketId: socket.id, event, ip, userId }, 'Socket event rate limited')
      const isNowBanned = await recordViolation(socket)

      if (isNowBanned) {
        logger.warn(
          { socketId: socket.id, ip, userId },
          'Client exceeded violation threshold; banning and disconnecting',
        )
        socket.emit('error', {
          code: 'BANNED',
          message: 'Temporarily banned due to repeated rate limit violations',
        })
        socket.disconnect(true)
      } else {
        socket.emit('error', {
          code: 'RATE_LIMITED',
          message: 'Too many requests, slow down',
        })
      }
      return
    }

    ;(socket as any).__guardedEventTick = Date.now()
    next()
  })
}

/**
 * Call at the top of every client event handler. Returns false (and notifies
 * the client) once the socket has exceeded its per-window event budget.
 */
export function guardEventRate(socket: Socket<object, ServerToClientEvents>): boolean {
  if ((socket as any).__guardedEventTick && Date.now() - (socket as any).__guardedEventTick < 50) {
    return true
  }

  if (!eventLimiter.consume(socket.id)) {
    logger.warn({ socketId: socket.id }, 'Socket event rate limited')
    socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many requests, slow down' })
    return false
  }

  return true
}

export function sweepRateLimiter(): void {
  connectionLimiter.sweep()
  userConnectionLimiter.sweep()
  eventLimiter.sweep()

  const now = Date.now()
  for (const [key, resetAt] of inMemoryBans) {
    if (now >= resetAt) inMemoryBans.delete(key)
  }
  for (const [key, entry] of inMemoryViolations) {
    if (now >= entry.resetAt) inMemoryViolations.delete(key)
  }
}

export function clearRateLimits(): void {
  connectionLimiter.clear()
  userConnectionLimiter.clear()
  eventLimiter.clear()
  inMemoryBans.clear()
  inMemoryViolations.clear()
  resetRateLimitConfig()
}
