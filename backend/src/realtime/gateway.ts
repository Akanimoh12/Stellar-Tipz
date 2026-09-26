import { configureBackpressure } from '../modules/realtime/backpressure.js';
import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from '../config/env.js';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';
import { registerClosable } from '../common/utils/lifecycle.js';
import { redis } from '../db/redis.js';
import { socketAuth } from './auth.js';
import {
  connectionRateLimit,
  userConnectionRateLimit,
  attachPacketRateLimiter,
  sweepRateLimiter,
  guardEventRate,
} from './rateLimit.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  NotificationPayload,
  BalanceUpdatedPayload,
  LeaderboardUpdatedPayload,
  AuthExpiredPayload,
} from './types.js';
import {
  catchUp,
  catchupRequestSchema,
  publishRoomEvent,
  ROOM_EVENT_CHANNEL,
  type RoomEvent,
} from './catchup.js';
import type { TipResponseDto } from '../modules/tips/tips.dto.js';

/** Room joined by every socket that wants public leaderboard updates. */
const LEADERBOARD_ROOM = 'leaderboard'
const PUBLIC_ROOMS = new Set([LEADERBOARD_ROOM])

export type RealtimeServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

let io: RealtimeServer | null = null

/**
 * Heartbeat tuning (see docs/REALTIME.md): how often the server pings each
 * client, and how long it waits for a pong before considering it disconnected.
 */
const HEARTBEAT_PING_INTERVAL_MS = env.SOCKET_IO_HEARTBEAT_INTERVAL_MS;
const HEARTBEAT_PING_TIMEOUT_MS = env.SOCKET_IO_CONNECTION_TIMEOUT_MS;

const AUTH_EXPIRED_PAYLOAD: AuthExpiredPayload = {
  code: 'AUTH_TOKEN_EXPIRED',
  message: 'Access token expired',
};

type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/** Enforces the verified JWT expiry for the lifetime of one connected socket. */
export function scheduleTokenExpiry(socket: RealtimeSocket): void {
  const expiresInMs = Math.max(0, socket.data.auth.exp * 1_000 - Date.now());

  const expiryTimer = setTimeout(() => {
    logger.info(
      { socketId: socket.id, userId: socket.data.auth.userId },
      'Disconnecting client because access token expired',
    );

    socket.emit('auth.expired', AUTH_EXPIRED_PAYLOAD);
    socket.disconnect(true);
  }, expiresInMs);

  expiryTimer.unref();

  socket.once('disconnect', () => {
    clearTimeout(expiryTimer);
  });
}

export function initRealtime(httpServer: HttpServer): RealtimeServer {
  io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    },
    pingInterval: HEARTBEAT_PING_INTERVAL_MS,
    pingTimeout: HEARTBEAT_PING_TIMEOUT_MS,
  });

  const gateway = io;
  configureBackpressure(io as unknown as SocketIOServer);
  io.use(connectionRateLimit);
  io.use(socketAuth);
  io.use(userConnectionRateLimit);

  if (config.realtime.redisAdapterEnabled) {
    const pubClient = redis.duplicate()
    const subClient = redis.duplicate()
    io.adapter(createAdapter(pubClient, subClient))

    registerClosable({
      name: 'Socket.IO Redis adapter',
      close: async () => {
        await Promise.all([pubClient.quit(), subClient.quit()])
      },
    })

    logger.info('Socket.IO Redis adapter attached')
  }

  const subscriber = redis.duplicate();
  subscriber.on('message', (channel, raw) => {
    if (channel !== ROOM_EVENT_CHANNEL) return;
    try {
      const message = JSON.parse(raw) as RoomEvent;
      gateway.local.to(message.room).emit('realtime.event', message);
    } catch (err) {
      logger.error({ err }, 'Invalid realtime room event');
    }
  });
  void subscriber
    .subscribe(ROOM_EVENT_CHANNEL)
    .catch((err: unknown) => logger.error({ err }, 'Realtime subscription failed'));
  registerClosable({
    name: 'Realtime catch-up subscriber',
    close: async () => {
      await subscriber.quit();
    },
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data.auth
    attachPacketRateLimiter(socket)
    scheduleTokenExpiry(socket)
    logger.info({ socketId: socket.id, userId }, 'Client connected')
    socket.emit('connected', { userId })

    socket.on('realtime:catchup', async (request, reply) => {
      if (!guardEventRate(socket) || typeof reply !== 'function') return;
      const parsed = catchupRequestSchema.safeParse(request);
      if (!parsed.success) {
        reply({ events: [], refreshRequired: true, error: 'INVALID_REQUEST' });
        return;
      }
      const { room, lastSeenId } = parsed.data;
      if (!socket.rooms.has(room) || (room.startsWith('user:') && room !== `user:${userId}`)) {
        reply({ events: [], refreshRequired: true, error: 'FORBIDDEN' });
        return;
      }
      try {
        reply(await catchUp(room, lastSeenId));
      } catch (err) {
        logger.error({ err, room }, 'Realtime catch-up unavailable');
        reply({ events: [], refreshRequired: true, error: 'UNAVAILABLE' });
      }
    });

    socket.on('subscribe:creator', (creatorAddress: string) => {
      if (!guardEventRate(socket)) return
      const room = `creator:${creatorAddress}`
      if (socket.data.auth.stellarAddress !== creatorAddress) {
        logger.warn(
          { socketId: socket.id, userId, room, requestedCreator: creatorAddress },
          'Security event: unauthorized realtime room join',
        )
        socket.emit('error', { code: 'FORBIDDEN', message: 'Cannot subscribe to another creator' })
        return
      }
      void socket.join(room)
      logger.debug({ socketId: socket.id, room }, 'Subscribed to creator room')
    })

    socket.on('subscribe:notifications', (userId: string) => {
      if (!guardEventRate(socket)) return
      if (socket.data.auth.userId !== userId) {
        logger.warn(
          { socketId: socket.id, userId: socket.data.auth.userId, room: `user:${userId}` },
          'Security event: unauthorized realtime room join',
        )
        socket.emit('error', { code: 'FORBIDDEN', message: 'Cannot subscribe to another user' })
        return
      }
      const room = `user:${userId}`
      void socket.join(room)
      logger.debug({ socketId: socket.id, room }, 'Subscribed to notifications room')
    })

    socket.on('unsubscribe:creator', (creatorAddress: string) => {
      if (!guardEventRate(socket)) return
      const room = `creator:${creatorAddress}`
      void socket.leave(room)
      logger.debug({ socketId: socket.id, room }, 'Unsubscribed from creator room')
    })

    socket.on('unsubscribe:notifications', (userId: string) => {
      if (!guardEventRate(socket)) return
      const room = `user:${userId}`
      void socket.leave(room)
      logger.debug({ socketId: socket.id, room }, 'Unsubscribed from notifications room')
    })

    socket.on('subscribe:leaderboard', () => {
      if (!guardEventRate(socket)) return
      if (!PUBLIC_ROOMS.has(LEADERBOARD_ROOM)) {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Room is not public' })
        return
      }
      void socket.join(LEADERBOARD_ROOM)
      logger.debug(
        { socketId: socket.id, room: LEADERBOARD_ROOM },
        'Subscribed to public leaderboard room',
      )
    })

    socket.on('unsubscribe:leaderboard', () => {
      if (!guardEventRate(socket)) return
      void socket.leave(LEADERBOARD_ROOM)
      logger.debug(
        { socketId: socket.id, room: LEADERBOARD_ROOM },
        'Unsubscribed from leaderboard room',
      )
    })

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Client disconnected')
    })
  })

  const sweepInterval = setInterval(() => sweepRateLimiter(), 60_000)
  sweepInterval.unref()

  registerClosable({
    name: 'Socket.IO',
    close: async () => {
      clearInterval(sweepInterval);
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
      if (io === gateway) io = null;
    },
  })

  logger.info('Realtime gateway initialized')
  return io
}

export function emitTipCreated(tip: TipResponseDto): void {
  bufferEvent(`creator:${tip.toAddress}`, 'tip.created', tip);
  if (!io) return;
  io.to(`creator:${tip.toAddress}`).emit('tip.created', tip);
  logger.debug({ txHash: tip.txHash, room: `creator:${tip.toAddress}` }, 'Emitted tip.created');
}

export function emitNotificationCreated(notification: NotificationPayload): void {
  bufferEvent(`user:${notification.userId}`, 'notification.created', notification);
  if (!io) return;
  io.to(`user:${notification.userId}`).emit('notification.created', notification);
  logger.debug(
    { notificationId: notification.id, room: `user:${notification.userId}` },
    'Emitted notification.created',
  )
}

/** Notifies a user's authenticated sockets (the `user:<id>` room) that their balance changed. */
export function emitBalanceUpdated(balance: BalanceUpdatedPayload): void {
  bufferEvent(`user:${balance.userId}`, 'balance.updated', balance);
  if (!io) return;
  io.to(`user:${balance.userId}`).emit('balance.updated', balance);
  logger.debug(
    { userId: balance.userId, room: `user:${balance.userId}` },
    'Emitted balance.updated',
  )
}

/** Broadcasts a leaderboard rank change to every socket subscribed to the public `leaderboard` room. */
export function emitLeaderboardUpdated(update: LeaderboardUpdatedPayload): void {
  bufferEvent(LEADERBOARD_ROOM, 'leaderboard.updated', update);
  if (!io) return;
  io.to(LEADERBOARD_ROOM).emit('leaderboard.updated', update);
  logger.debug(
    { userId: update.entry.userId, window: update.window, room: LEADERBOARD_ROOM },
    'Emitted leaderboard.updated',
  )
}

export function getIO(): SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null {
  return io
}

function bufferEvent(room: string, event: string, payload: unknown): void {
  void publishRoomEvent(room, event, payload).catch((err: unknown) =>
    logger.error({ err, room }, 'Realtime buffer unavailable; durable REST data remains available'),
  );
}
