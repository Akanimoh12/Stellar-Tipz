import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import jwt from 'jsonwebtoken'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../config/env.js'
import { initRealtime } from './gateway.js'
import {
  clearRateLimits,
  setRateLimitConfig,
  resetRateLimitConfig,
  isBanned,
  banTarget,
  consumeConnection,
  consumeUserConnection,
  consumeEvent,
  RedisSlidingWindowLimiter,
} from './rateLimit.js'

function makeToken(payload: { userId: string; stellarAddress?: string }): string {
  return jwt.sign(
    { stellarAddress: 'GTEST', role: 'user', scopes: [], ...payload },
    env.JWT_SECRET,
    { expiresIn: '15m' },
  )
}

describe('Realtime Rate Limiting (issue #1284)', () => {
  let httpServer: ReturnType<typeof createServer>
  let port: number
  const openSockets: ClientSocket[] = []

  function createClient(options?: { token?: string }): ClientSocket {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token: options?.token ?? makeToken({ userId: 'test-user' }) },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    })
    openSockets.push(socket)
    return socket
  }

  beforeEach(async () => {
    clearRateLimits()
    httpServer = createServer()
    initRealtime(httpServer)
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    port = (httpServer.address() as AddressInfo).port
  })

  afterEach(async () => {
    for (const socket of openSockets) {
      if (socket.connected) {
        socket.disconnect()
      }
    }
    openSockets.length = 0
    clearRateLimits()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  describe('Message Flood Protection', () => {
    it('rate limits every inbound client event type when threshold is exceeded', async () => {
      setRateLimitConfig({ eventLimitPerSocket: 2, eventWindowMs: 10_000 })
      const client = createClient()
      await new Promise<void>((resolve) => client.on('connect', () => resolve()))

      const rateLimitErrors: Array<{ code: string; message: string }> = []
      client.on('error', (err) => {
        if (err.code === 'RATE_LIMITED') {
          rateLimitErrors.push(err)
        }
      })

      // Emit two valid events within budget
      client.emit('subscribe:leaderboard')
      client.emit('subscribe:creator', 'GTEST')
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(rateLimitErrors).toHaveLength(0)

      // Third event exceeds budget of 2 events
      client.emit('subscribe:leaderboard')
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(rateLimitErrors.length).toBeGreaterThanOrEqual(1)
      expect(rateLimitErrors[0]).toEqual({
        code: 'RATE_LIMITED',
        message: 'Too many requests, slow down',
      })
    })

    it('intercepts arbitrary and custom inbound client event types via packet middleware', async () => {
      setRateLimitConfig({ eventLimitPerSocket: 1, eventWindowMs: 10_000 })
      const client = createClient()
      await new Promise<void>((resolve) => client.on('connect', () => resolve()))

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        client.on('error', resolve)
      })

      // 1st event passes
      client.emit('custom:arbitrary-event', { data: 'test' })
      // 2nd event immediately exceeds quota
      client.emit('custom:arbitrary-event', { data: 'spam' })

      const err = await errorPromise
      expect(err.code).toBe('RATE_LIMITED')
    })
  })

  describe('Connection Flood Protection', () => {
    it('caps connections per client IP', async () => {
      setRateLimitConfig({ connectionLimitPerIp: 2, connectionWindowMs: 60_000 })

      // Connection 1: should succeed
      const client1 = createClient({ token: makeToken({ userId: 'user-1' }) })
      await new Promise<void>((resolve, reject) => {
        client1.on('connect', resolve)
        client1.on('connect_error', reject)
      })

      // Connection 2: should succeed
      const client2 = createClient({ token: makeToken({ userId: 'user-2' }) })
      await new Promise<void>((resolve, reject) => {
        client2.on('connect', resolve)
        client2.on('connect_error', reject)
      })

      // Connection 3: should be rejected at handshake (per-IP limit = 2)
      const client3 = createClient({ token: makeToken({ userId: 'user-3' }) })
      const connectError = await new Promise<Error>((resolve) => {
        client3.on('connect_error', resolve)
      })

      expect(connectError.message).toMatch(/Too many connection attempts/)
    })

    it('caps connections per user across separate sockets', async () => {
      setRateLimitConfig({
        connectionLimitPerIp: 10,
        connectionLimitPerUser: 2,
        userConnectionWindowMs: 60_000,
      })

      const sharedUserId = 'limited-user'

      // 1st connection for user: succeeds
      const client1 = createClient({ token: makeToken({ userId: sharedUserId }) })
      await new Promise<void>((resolve, reject) => {
        client1.on('connect', resolve)
        client1.on('connect_error', reject)
      })

      // 2nd connection for user: succeeds
      const client2 = createClient({ token: makeToken({ userId: sharedUserId }) })
      await new Promise<void>((resolve, reject) => {
        client2.on('connect', resolve)
        client2.on('connect_error', reject)
      })

      // 3rd connection for same user: rejected
      const client3 = createClient({ token: makeToken({ userId: sharedUserId }) })
      const connectError = await new Promise<Error>((resolve) => {
        client3.on('connect_error', resolve)
      })

      expect(connectError.message).toMatch(/Too many connections for this user/)

      // Connection for a different user should still be permitted
      const clientOther = createClient({ token: makeToken({ userId: 'another-user' }) })
      await new Promise<void>((resolve, reject) => {
        clientOther.on('connect', resolve)
        clientOther.on('connect_error', reject)
      })
      expect(clientOther.connected).toBe(true)
    })
  })

  describe('Repeated Violations & Temporary Ban', () => {
    it('disconnects and temporarily bans a client after repeated violations', async () => {
      setRateLimitConfig({
        eventLimitPerSocket: 1,
        eventWindowMs: 10_000,
        maxViolationsBeforeBan: 3,
        banDurationMs: 60_000,
      })

      const bannedUserId = 'banning-user'
      const client = createClient({ token: makeToken({ userId: bannedUserId }) })
      await new Promise<void>((resolve) => client.on('connect', () => resolve()))

      const banErrorReceived = new Promise<{ code: string }>((resolve) => {
        client.on('error', (err) => {
          if (err.code === 'BANNED') resolve(err)
        })
      })

      const disconnected = new Promise<string>((resolve) => {
        client.on('disconnect', resolve)
      })

      // 1st event within budget
      client.emit('subscribe:leaderboard')

      // 3 subsequent events cause 3 violations, hitting threshold of 3
      client.emit('subscribe:leaderboard')
      client.emit('subscribe:leaderboard')
      client.emit('subscribe:leaderboard')

      const banErr = await banErrorReceived
      expect(banErr.code).toBe('BANNED')

      await disconnected
      expect(client.connected).toBe(false)

      // Verify that reconnecting during the temporary ban is rejected at handshake
      const reconnectClient = createClient({ token: makeToken({ userId: bannedUserId }) })
      const handshakeErr = await new Promise<Error>((resolve) => {
        reconnectClient.on('connect_error', resolve)
      })

      expect(handshakeErr.message).toMatch(/Temporarily banned due to rate limit violations/)
    })
  })

  describe('Cross-Instance Enforcement (Redis-Backed)', () => {
    it('shares rate limits across separate instances when backed by a shared Redis store', async () => {
      // In-memory Redis simulation mock
      const sharedSortedSets = new Map<string, Array<{ score: number; member: string }>>()
      const sharedKeys = new Map<string, { value: string; expiry: number }>()

      const mockRedis = {
        zremrangebyscore: vi.fn(async (key: string, min: number, max: number) => {
          const set = sharedSortedSets.get(key) || []
          const filtered = set.filter((item) => item.score > max)
          sharedSortedSets.set(key, filtered)
          return set.length - filtered.length
        }),
        zcard: vi.fn(async (key: string) => {
          const set = sharedSortedSets.get(key) || []
          return set.length
        }),
        zadd: vi.fn(async (key: string, score: number, member: string) => {
          const set = sharedSortedSets.get(key) || []
          set.push({ score, member })
          sharedSortedSets.set(key, set)
          return 1
        }),
        pexpire: vi.fn(async () => 1),
        del: vi.fn(async (key: string) => {
          sharedSortedSets.delete(key)
          sharedKeys.delete(key)
          return 1
        }),
        set: vi.fn(async (key: string, value: string) => {
          sharedKeys.set(key, { value, expiry: Date.now() + 60_000 })
          return 'OK'
        }),
        exists: vi.fn(async (key: string) => {
          return sharedKeys.has(key) ? 1 : 0
        }),
      }

      // Instance 1 and Instance 2 share the same mockRedis backend
      const instance1Limiter = new RedisSlidingWindowLimiter(
        'rl:test:event:',
        () => ({ max: 2, windowMs: 10_000 }),
        mockRedis as any,
      )

      const instance2Limiter = new RedisSlidingWindowLimiter(
        'rl:test:event:',
        () => ({ max: 2, windowMs: 10_000 }),
        mockRedis as any,
      )

      const userId = 'cross-instance-user'

      // Instance 1 consumes 1 hit
      const allowed1 = await instance1Limiter.consume(userId)
      expect(allowed1).toBe(true)

      // Instance 2 consumes 1 hit -> total hits = 2
      const allowed2 = await instance2Limiter.consume(userId)
      expect(allowed2).toBe(true)

      // Instance 1 attempts a 3rd hit -> exceeds shared max of 2
      const allowed3 = await instance1Limiter.consume(userId)
      expect(allowed3).toBe(false)

      // Instance 2 also sees it exceeded
      const allowed4 = await instance2Limiter.consume(userId)
      expect(allowed4).toBe(false)
    })
  })
})
