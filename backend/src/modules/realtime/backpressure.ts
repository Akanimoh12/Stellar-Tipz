import { Server as SocketIOServer, Socket } from 'socket.io';
import { env } from '@/config/env.js';
import { logger } from '@/common/utils/logger.js';

interface ConnectionMetrics {
  bufferedBytes: number;
  lastEventTime: number;
  eventFrequency: number;
}

const connectionMetrics = new Map<string, ConnectionMetrics>();

export function configureBackpressure(io: SocketIOServer): void {
  const maxBufferSize = env.SOCKET_IO_MAX_BUFFER_SIZE;
  const connectionTimeout = env.SOCKET_IO_CONNECTION_TIMEOUT_MS;

  io.on('connection', (socket: Socket) => {
    logger.debug({ clientId: socket.id }, 'Client connected');

    connectionMetrics.set(socket.id, {
      bufferedBytes: 0,
      lastEventTime: Date.now(),
      eventFrequency: 0,
    });

    socket.on('disconnect', () => {
      connectionMetrics.delete(socket.id);
      logger.debug({ clientId: socket.id }, 'Client disconnected');
    });

    socket.on('error', (error) => {
      logger.error({ clientId: socket.id, error }, 'Socket error');
    });
  });

  io.engine.on('connection', (rawSocket) => {
    const clientId = rawSocket.id;
    let lastBufferCheck = Date.now();

    const checkBackpressure = setInterval(() => {
      const socket = io.sockets.sockets.get(clientId);
      if (!socket) {
        clearInterval(checkBackpressure);
        return;
      }

      const writableLength = (socket.conn.transport as any)?.writable?.writableLength || 0;
      const bufferSize = writableLength;

      if (bufferSize > maxBufferSize) {
        logger.warn(
          {
            clientId,
            bufferSize,
            maxBufferSize,
            excess: bufferSize - maxBufferSize,
          },
          'Client buffer exceeded limit, disconnecting'
        );

        socket.emit('backpressure_disconnect', {
          reason: 'client_buffer_exceeded',
          bufferSize,
          maxBufferSize,
        });

        socket.disconnect(true);
        clearInterval(checkBackpressure);
      } else if (bufferSize > maxBufferSize * 0.8) {
        logger.warn(
          {
            clientId,
            bufferSize,
            maxBufferSize,
            utilization: ((bufferSize / maxBufferSize) * 100).toFixed(1) + '%',
          },
          'Client buffer pressure high'
        );
      }

      lastBufferCheck = Date.now();
    }, 1000);

    rawSocket.on('close', () => {
      clearInterval(checkBackpressure);
      connectionMetrics.delete(clientId);
    });
  });
}

export function throttleEventPerConnection(
  socket: Socket,
  event: string,
  data: any,
  throttleMs: number = 100
): boolean {
  const metrics = connectionMetrics.get(socket.id);
  if (!metrics) {
    socket.emit(event, data);
    return true;
  }

  const now = Date.now();
  const timeSinceLastEvent = now - metrics.lastEventTime;

  if (timeSinceLastEvent < throttleMs) {
    logger.debug(
      { clientId: socket.id, event, throttledMs: timeSinceLastEvent },
      'Event throttled'
    );
    return false;
  }

  metrics.lastEventTime = now;
  socket.emit(event, data);
  return true;
}

export function broadcastWithBackpressure(
  io: SocketIOServer,
  event: string,
  data: any,
  options?: {
    throttleMs?: number;
    filterSockets?: (socket: Socket) => boolean;
  }
): void {
  const sockets = Array.from(io.sockets.sockets.values());

  for (const socket of sockets) {
    if (options?.filterSockets && !options.filterSockets(socket)) {
      continue;
    }

    const shouldEmit = throttleEventPerConnection(
      socket,
      event,
      data,
      options?.throttleMs || 100
    );

    if (!shouldEmit && logger.level <= 20) {
      logger.debug({ event, clientId: socket.id }, 'Event throttled in broadcast');
    }
  }
}

export function getConnectionMetrics(): {
  totalConnections: number;
  highPressureConnections: number;
  averageBufferSize: number;
} {
  const metrics = Array.from(connectionMetrics.values());
  const totalConnections = metrics.length;

  if (totalConnections === 0) {
    return {
      totalConnections: 0,
      highPressureConnections: 0,
      averageBufferSize: 0,
    };
  }

  const highPressureThreshold = env.SOCKET_IO_MAX_BUFFER_SIZE * 0.8;
  const highPressureConnections = metrics.filter(
    (m) => m.bufferedBytes > highPressureThreshold
  ).length;
  const averageBufferSize =
    metrics.reduce((sum, m) => sum + m.bufferedBytes, 0) / totalConnections;

  return {
    totalConnections,
    highPressureConnections,
    averageBufferSize,
  };
}
