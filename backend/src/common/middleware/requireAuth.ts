import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { UnauthorizedError } from '../errors/AppError.js';
import type { AuthUser } from '../../modules/auth/auth.types.js';

declare module 'express' {
  interface Request {
    user?: AuthUser;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid authorization header'));
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as { sub: string; stellarAddress: string };
    req.user = { id: payload.sub, stellarAddress: payload.stellarAddress, username: null };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}
