import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { UnauthorizedError } from '../errors/AppError.js';
import type { AuthUser } from '../../modules/auth/auth.types.js';

interface JwtPayload {
  sub: string;
  stellarAddress: string;
}

/**
 * Validates the Bearer access JWT from the Authorization header and attaches
 * the decoded user to req.user. Passes a 401 UnauthorizedError to next() on
 * any failure (missing header, bad format, invalid/expired token).
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid authorization header'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
    const user: AuthUser = {
      id: payload.sub,
      stellarAddress: payload.stellarAddress,
      username: null,
    };
    req.user = user;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired access token'));
  }
}
