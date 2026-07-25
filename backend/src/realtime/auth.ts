import type { Socket, ExtendedError } from 'socket.io';
import { verifyAccessToken } from '../modules/auth/auth.service.js';
import { logger } from '../common/utils/logger.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from './types.js';

type AuthSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Socket.IO handshake middleware: authenticates a connecting socket using the
 * same JWT access token issued by the REST auth module.
 *
 * The client must send the token as `socket.handshake.auth.token`, e.g.:
 *   io(url, { auth: { token: accessToken } })
 *
 * On success, the decoded payload is attached to `socket.data.auth`.
 * On failure, the connection is rejected before `connection` fires.
 */
export function socketAuth(socket: AuthSocket, next: (err?: ExtendedError) => void): void {
  const token = socket.handshake.auth?.['token'] as string | undefined;

  if (!token) {
    logger.warn({ socketId: socket.id }, 'Socket connection rejected: no token');
    next(new Error('Authentication token is required'));
    return;
  }

  try {
    socket.data.auth = verifyAccessToken(token);
    logger.debug(
      { socketId: socket.id, userId: socket.data.auth.userId },
      'Socket authenticated',
    );
    next();
  } catch {
    logger.warn({ socketId: socket.id }, 'Socket connection rejected: invalid token');
    next(new Error('Invalid or expired token'));
  }
}
