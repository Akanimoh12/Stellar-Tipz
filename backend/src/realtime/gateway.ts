import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../common/utils/logger.js';
import { registerClosable } from '../common/utils/lifecycle.js';
import { socketAuth } from './auth.js';
import { connectionRateLimit, eventLimiter, guardEventRate } from './rateLimit.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  NotificationPayload,
} from './types.js';
import type { TipResponseDto } from '../modules/tips/tips.dto.js';

export type RealtimeServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: RealtimeServer | null = null;

/**
 * Heartbeat tuning (see docs/REALTIME.md): how often the server pings each
 * client, and how long it waits for a pong before considering it disconnected.
 */
const HEARTBEAT_PING_INTERVAL_MS = 25_000;
const HEARTBEAT_PING_TIMEOUT_MS = 20_000;

export function initRealtime(httpServer: HttpServer): RealtimeServer {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: env.CORS_ORIGIN.split(','),
        methods: ['GET', 'POST'],
      },
      pingInterval: HEARTBEAT_PING_INTERVAL_MS,
      pingTimeout: HEARTBEAT_PING_TIMEOUT_MS,
    },
  );

  io.use(connectionRateLimit);
  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { userId } = socket.data.auth;
    logger.info({ socketId: socket.id, userId }, 'Client connected');
    socket.emit('connected', { userId });

    socket.on('subscribe:creator', (creatorAddress: string) => {
      if (!guardEventRate(socket)) return;
      const room = `creator:${creatorAddress}`;
      void socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Subscribed to creator room');
    });

    socket.on('subscribe:notifications', (userId: string) => {
      if (!guardEventRate(socket)) return;
      if (socket.data.auth.userId !== userId) {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Cannot subscribe to another user' });
        return;
      }
      const room = `user:${userId}`;
      void socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Subscribed to notifications room');
    });

    socket.on('unsubscribe:creator', (creatorAddress: string) => {
      if (!guardEventRate(socket)) return;
      const room = `creator:${creatorAddress}`;
      void socket.leave(room);
      logger.debug({ socketId: socket.id, room }, 'Unsubscribed from creator room');
    });

    socket.on('unsubscribe:notifications', (userId: string) => {
      if (!guardEventRate(socket)) return;
      const room = `user:${userId}`;
      void socket.leave(room);
      logger.debug({ socketId: socket.id, room }, 'Unsubscribed from notifications room');
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Client disconnected');
    });
  });

  const sweepInterval = setInterval(() => eventLimiter.sweep(), 60_000);
  sweepInterval.unref();

  registerClosable({
    name: 'Socket.IO',
    close: async () => {
      clearInterval(sweepInterval);
      await new Promise<void>((resolve) => io?.close(() => resolve()));
    },
  });

  logger.info('Realtime gateway initialized');
  return io;
}

export function emitTipCreated(tip: TipResponseDto): void {
  if (!io) return;
  io.to(`creator:${tip.toAddress}`).emit('tip.created', tip);
  logger.debug({ txHash: tip.txHash, room: `creator:${tip.toAddress}` }, 'Emitted tip.created');
}

export function emitNotificationCreated(notification: NotificationPayload): void {
  if (!io) return;
  io.to(`user:${notification.userId}`).emit('notification.created', notification);
  logger.debug(
    { notificationId: notification.id, room: `user:${notification.userId}` },
    'Emitted notification.created',
  );
}

export function getIO(): RealtimeServer | null {
  return io;
}
