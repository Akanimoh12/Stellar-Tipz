import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../common/utils/logger.js';
import { socketAuth } from './auth.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  NotificationPayload,
} from './types.js';
import type { TipResponseDto } from '../modules/tips/tips.dto.js';

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

export function initRealtime(httpServer: HttpServer): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(','),
      methods: ['GET', 'POST'],
    },
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id, userId: socket.authUser?.id }, 'Client connected');

    socket.on('subscribe:creator', (creatorAddress: string) => {
      if (!socket.authUser) {
        (socket as any).emit('error', { message: 'Not authenticated' });
        return;
      }
      const room = `creator:${creatorAddress}`;
      void socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Subscribed to creator room');
    });

    socket.on('subscribe:notifications', (userId: string) => {
      if (!socket.authUser) {
        (socket as any).emit('error', { message: 'Not authenticated' });
        return;
      }
      if (socket.authUser.id !== userId) {
        (socket as any).emit('error', { message: 'Forbidden' });
        return;
      }
      const room = `user:${userId}`;
      void socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Subscribed to notifications room');
    });

    socket.on('unsubscribe:creator', (creatorAddress: string) => {
      const room = `creator:${creatorAddress}`;
      void socket.leave(room);
      logger.debug({ socketId: socket.id, room }, 'Unsubscribed from creator room');
    });

    socket.on('unsubscribe:notifications', (userId: string) => {
      const room = `user:${userId}`;
      void socket.leave(room);
      logger.debug({ socketId: socket.id, room }, 'Unsubscribed from notifications room');
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Client disconnected');
    });
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
  logger.debug({ notificationId: notification.id, room: `user:${notification.userId}` }, 'Emitted notification.created');
}

export function getIO(): SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null {
  return io;
}
