import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../errors/AppError.js';
import type { AuthUser } from '../../modules/auth/auth.types.js';
import type { AuthPayload } from '../../modules/auth/auth.types.js';
import { verifyAccessToken } from '../../modules/auth/jwt.js';

interface JwtPayload {
  sub: string;
  stellarAddress: string;
  userId?: string;
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
    // Use rotation-aware verifier; supports both `sub` (legacy requireAuth) and `userId`
    const payload = verifyAccessToken(token) as AuthPayload & JwtPayload;
    const user: AuthUser = {
      id: (payload as unknown as JwtPayload).sub ?? payload.userId,
      stellarAddress: payload.stellarAddress,
      username: null,
    };
    req.user = user;
    next();
  } catch (err) {
    next(err instanceof UnauthorizedError ? err : new UnauthorizedError('Invalid or expired access token'));
  }
}
