/**
 * Real-time gateway entry point.
 * Wires Socket.IO server with auth, rate limiting, and event handlers.
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../modules/auth/auth.service.js';
import { logger } from '../common/utils/logger.js';
import { config } from '../config/index.js';
import {
  type TypedServer,
  type TypedSocket,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type InterServerEvents,
  type SocketDataExtended,
  type ConnectedPayload,
  type TipCreatedPayload,
  type CreditUpdatedPayload,
  type LeaderboardUpdatedPayload,
  type NotificationCreatedPayload,
} from './types.js';
import {
  connectionRateLimit,
  userConnectionRateLimit,
  attachPacketRateLimiter,
  guardEventRate,
  sweepRateLimiter,
  clearRateLimits,
} from './rateLimit.js';

/** Extended auth payload with standard JWT claims */
interface ExtendedAuthPayload {
  userId: string;
  stellarAddress: string;
  role: string;
  scopes: string[];
  iat?: number;
  exp?: number;
}

let ioInstance: TypedServer | null = null;

/**
 * Initialize and attach Socket.IO to an HTTP server.
 * Call once at startup from server.ts.
 */
export function initRealtime(httpServer: HttpServer): TypedServer {
  if (ioInstance) {
    logger.warn('Realtime gateway already initialized; returning existing instance');
    return ioInstance;
  }

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketDataExtended>(httpServer, {
    cors: {
      origin: config.server.corsOrigin.split(','),
      credentials: true,
    },
    pingInterval: config.realtime?.pingIntervalMs ?? 25_000,
    pingTimeout: config.realtime?.pingTimeoutMs ?? 20_000,
    maxHttpBufferSize: 1e6, // 1 MB
  });

  // Connection rate limiting (per IP)
  io.use(connectionRateLimit);

  // Authentication handshake
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token ?? socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyAccessToken(token);
      if (!payload) {
        return next(new Error('Invalid or expired token'));
      }

      // Decode token to get standard JWT claims (iat, exp)
      const decoded = jwt.decode(token) as ExtendedAuthPayload | null;

      // Attach auth data to socket
      socket.data.auth = {
        userId: payload.userId,
        address: payload.stellarAddress,
        tier: 'silver', // Default tier; could be fetched from profile if needed
        iat: decoded?.iat,
        exp: decoded?.exp,
      };

      // Per-user connection rate limiting
      await userConnectionRateLimit(socket, next);
    } catch (err) {
      logger.warn({ err }, 'Socket auth failed');
      next(new Error('Authentication failed'));
    }
  });

  // Attach per-event rate limiter to each connected socket
  io.on('connection', (socket: TypedSocket) => {
    const { userId, address, tier } = socket.data.auth!;
    logger.info({ socketId: socket.id, userId, address, tier }, 'Socket connected');

    // Send connection acknowledgment
    const connectedPayload: ConnectedPayload = {
      socketId: socket.id,
      serverTime: Date.now(),
      heartbeatIntervalMs: config.realtime?.pingIntervalMs ?? 25_000,
    };
    socket.emit('connected', connectedPayload);

    // Attach packet-level rate limiter
    attachPacketRateLimiter(socket);

    // Room join/leave for creator tips
    socket.on('room:join', (creatorAddress, ack) => {
      if (!guardEventRate(socket)) return;
      if (!creatorAddress || typeof creatorAddress !== 'string') {
        ack?.({ message: 'Invalid creator address' });
        return;
      }
      const room = `creator:${creatorAddress}`;
      socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Socket joined room');
      ack?.(undefined);
    });

    socket.on('room:leave', (creatorAddress) => {
      if (!guardEventRate(socket)) return;
      if (!creatorAddress || typeof creatorAddress !== 'string') return;
      const room = `creator:${creatorAddress}`;
      socket.leave(room);
      logger.debug({ socketId: socket.id, room }, 'Socket left room');
    });

    // Leaderboard subscription
    socket.on('leaderboard:subscribe', (period, ack) => {
      if (!guardEventRate(socket)) return;
      const validPeriods = ['all', 'monthly', 'weekly'] as const;
      if (!validPeriods.includes(period)) {
        ack?.({ message: 'Invalid period' });
        return;
      }
      const room = `leaderboard:${period}`;
      socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Socket subscribed to leaderboard');
      ack?.(undefined);
    });

    socket.on('leaderboard:unsubscribe', (period) => {
      if (!guardEventRate(socket)) return;
      const validPeriods = ['all', 'monthly', 'weekly'] as const;
      if (!validPeriods.includes(period)) return;
      const room = `leaderboard:${period}`;
      socket.leave(room);
      logger.debug({ socketId: socket.id, room }, 'Socket unsubscribed from leaderboard');
    });

    // Heartbeat ping/pong
    socket.on('ping', (ack) => {
      ack?.(Date.now());
    });

    // Disconnect handling
    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, userId, reason }, 'Socket disconnected');
    });

    // Error handling
    socket.on('error', (err) => {
      logger.warn({ socketId: socket.id, userId, err }, 'Socket error');
    });
  });

  // Periodic sweep of in-memory rate limiters
  const sweepInterval = setInterval(sweepRateLimiter, 60_000);
  sweepInterval.unref(); // Don't prevent process exit

  ioInstance = io;

  // Override the types module's initRealtime to return our instance
  // (This is a workaround for circular dependency; in practice, import initRealtime from here)
  logger.info('Realtime gateway initialized');
  return io;
}

/** Get the initialized Socket.IO server instance */
export function getRealtimeServer(): TypedServer | null {
  return ioInstance;
}

/** Broadcast a new tip to all sockets in a creator's room */
export function broadcastTipCreated(payload: TipCreatedPayload): void {
  if (!ioInstance) {
    logger.warn('Attempted to broadcast tip before realtime init');
    return;
  }
  const room = `creator:${payload.creator}`;
  ioInstance.to(room).emit('tip:created', payload);
  logger.debug({ room, tipId: payload.tipId }, 'Broadcast tip:created');
}

/** Broadcast a credit score update */
export function broadcastCreditUpdated(payload: CreditUpdatedPayload): void {
  if (!ioInstance) {
    logger.warn('Attempted to broadcast credit update before realtime init');
    return;
  }
  const room = `creator:${payload.creator}`;
  ioInstance.to(room).emit('credit:updated', payload);
  logger.debug({ room, creator: payload.creator }, 'Broadcast credit:updated');
}

/** Broadcast a leaderboard update */
export function broadcastLeaderboardUpdated(payload: LeaderboardUpdatedPayload): void {
  if (!ioInstance) {
    logger.warn('Attempted to broadcast leaderboard before realtime init');
    return;
  }
  const room = `leaderboard:${payload.period}`;
  ioInstance.to(room).emit('leaderboard:updated', payload);
  logger.debug({ room, period: payload.period }, 'Broadcast leaderboard:updated');
}

/** Send a notification to a specific user (by userId) */
export function sendNotificationToUser(userId: string, payload: NotificationCreatedPayload): void {
  if (!ioInstance) {
    logger.warn('Attempted to send notification before realtime init');
    return;
  }
  // Iterate sockets and find ones with matching userId
  for (const [, socket] of ioInstance.sockets.sockets) {
    if (socket.data.auth?.userId === userId) {
      socket.emit('notification:created', payload);
      logger.debug({ socketId: socket.id, userId }, 'Sent notification to user');
    }
  }
}

/** Graceful shutdown */
export async function closeRealtime(): Promise<void> {
  if (ioInstance) {
    clearRateLimits();
    await ioInstance.close();
    ioInstance = null;
    logger.info('Realtime gateway closed');
  }
}

// Re-export types for consumers
export type {
  TypedServer,
  TypedSocket,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketDataExtended,
  ConnectedPayload,
  TipCreatedPayload,
  CreditUpdatedPayload,
  LeaderboardUpdatedPayload,
  NotificationCreatedPayload,
} from './types.js';
