import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from '@/config/env.js';
import { logger } from '@/common/utils/logger.js';
import { configureBackpressure } from './backpressure.js';

let ioInstance: SocketIOServer | null = null;

export function initRealtime(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(','),
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: env.SOCKET_IO_HEARTBEAT_INTERVAL_MS,
    pingTimeout: env.SOCKET_IO_CONNECTION_TIMEOUT_MS,
  });

  configureBackpressure(io);

  io.on('connection', (socket) => {
    logger.debug({ clientId: socket.id }, 'Realtime client connected');

    socket.on('subscribe', (channel: string) => {
      socket.join(channel);
      logger.debug({ clientId: socket.id, channel }, 'Client subscribed to channel');
    });

    socket.on('unsubscribe', (channel: string) => {
      socket.leave(channel);
      logger.debug({ clientId: socket.id, channel }, 'Client unsubscribed from channel');
    });

    socket.on('disconnect', () => {
      logger.debug({ clientId: socket.id }, 'Realtime client disconnected');
    });
  });

  ioInstance = io;
  logger.info('Realtime gateway initialized');
  return io;
}

export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Realtime gateway not initialized');
  }
  return ioInstance;
}

export async function closeRealtime(): Promise<void> {
  if (ioInstance) {
    await ioInstance.close();
    ioInstance = null;
    logger.info('Realtime gateway closed');
  }
}

export function isRealtimeAvailable(): boolean {
  return ioInstance !== null;
}
