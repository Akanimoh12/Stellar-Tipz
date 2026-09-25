import type { Socket } from 'socket.io';
import { logger } from '../common/utils/logger.js';
import type { AuthPayload, AuthUser } from '../modules/auth/auth.types.js';
import { verifyAccessToken } from '../modules/auth/jwt.js';
import type {
  ClientToServerEvents,
  InterServerEvents,
  RealtimeAuthPayload,
  ServerToClientEvents,
  SocketData,
} from './types.js';

interface JwtPayload {
  exp?: number;
  sub?: string;
  userId?: string;
}

export interface AuthenticatedSocket extends Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> {
  authUser?: AuthUser;
}

declare module 'socket.io' {
  interface Socket {
    authUser?: AuthUser;
  }
}

export function socketAuth(socket: AuthenticatedSocket, next: (err?: Error) => void): void {
  const token: unknown = socket.handshake.auth?.token;

  if (typeof token !== 'string' || token.length === 0) {
    logger.warn({ socketId: socket.id }, 'Socket connection rejected: no token');
    next(new Error('Authentication token is required'));
    return;
  }

  try {
    const payload = verifyAccessToken(token) as AuthPayload & JwtPayload;
    const uid = payload.sub ?? payload.userId;
    if (!uid || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      throw new Error('Access token is missing required claims');
    }

    const auth: RealtimeAuthPayload = {
      ...payload,
      userId: uid,
      exp: payload.exp,
    };
    socket.data.auth = auth;
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
