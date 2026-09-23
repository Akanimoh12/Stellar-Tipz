import type { Socket } from 'socket.io';
import { logger } from '../common/utils/logger.js';
import type { AuthUser } from '../modules/auth/auth.types.js';
import { verifyAccessToken } from '../modules/auth/jwt.js';
import type { AuthPayload } from '../modules/auth/auth.types.js';

interface JwtPayload {
  sub: string;
  stellarAddress: string;
  userId?: string;
}

export interface AuthenticatedSocket extends Socket {
  authUser?: AuthUser;
}

declare module 'socket.io' {
  interface Socket {
    authUser?: AuthUser;
  }
}

export function socketAuth(socket: AuthenticatedSocket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    logger.warn({ socketId: socket.id }, 'Socket connection rejected: no token');
    next(new Error('Authentication token is required'));
    return;
  }

  try {
    const payload = verifyAccessToken(token) as AuthPayload & JwtPayload;
    const uid = (payload as unknown as JwtPayload).sub ?? payload.userId;
    socket.authUser = {
      id: uid,
      stellarAddress: payload.stellarAddress,
      username: null,
    };
    logger.debug({ socketId: socket.id, userId: uid }, 'Socket authenticated');
    next();
  } catch (err) {
    logger.warn({ socketId: socket.id, err }, 'Socket connection rejected: invalid token');
    next(new Error('Invalid or expired token'));
  }
}
