import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "./auth.service.js";
import {
  UnauthorizedError,
  ForbiddenError,
} from "../../common/errors/AppError.js";
import type { AuthPayload } from "./auth.types.js";
import { z } from "zod";

declare module "express" {
  interface Request {
    auth?: AuthPayload;
  }
}

/**
 * Middleware to verify JWT access token and attach auth payload to request.
 * Extracts token from Authorization header: "Bearer <token>"
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(
      new UnauthorizedError("Missing or invalid authorization header"),
    );
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyAccessToken(token);
    req.auth = payload;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to require authentication.
 * Alias for authMiddleware for clarity.
 */
export const requireAuth = authMiddleware;

/**
 * optionalAuth middleware.
 * Attaches `req.auth` if a valid Bearer token is present, but never rejects.
 * Routes that call this can check `req.auth` to distinguish authenticated
 * from anonymous requests.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyAccessToken(token);
    req.auth = payload;
  } catch {
    // Invalid/expired token — silently ignore, leave req.auth undefined
  }

  next();
}

/**
 * Schema for role validation.
 */
const roleSchema = z.string().min(1);

/**
 * Middleware factory to require a specific role.
 * Returns 403 Forbidden if the user doesn't have the required role.
 *
 * @param role - The required role (e.g., 'admin', 'moderator')
 * @returns Express middleware function
 */
export function requireRole(role: string) {
  // Validate role input with Zod
  const validationResult = roleSchema.safeParse(role);
  if (!validationResult.success) {
    throw new Error("Invalid role parameter");
  }

  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;

    if (!auth) {
      throw new UnauthorizedError("Authentication required");
    }

    if (auth.role !== role) {
      throw new ForbiddenError(`Requires role: ${role}`);
    }

    next();
  };
}

/**
 * Schema for scope validation.
 */
const scopeSchema = z.string().min(1);

/**
 * Middleware factory to require a specific scope.
 * Returns 403 Forbidden if the user doesn't have the required scope.
 *
 * @param scope - The required scope (e.g., 'read:tips', 'write:profile')
 * @returns Express middleware function
 */
export function requireScope(scope: string) {
  // Validate scope input with Zod
  const validationResult = scopeSchema.safeParse(scope);
  if (!validationResult.success) {
    throw new Error("Invalid scope parameter");
  }

  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;

    if (!auth) {
      throw new UnauthorizedError("Authentication required");
    }

    if (!auth.scopes || !auth.scopes.includes(scope)) {
      throw new ForbiddenError(`Requires scope: ${scope}`);
    }

    next();
  };
}

/**
 * Middleware factory to require any of the specified scopes.
 * Returns 403 Forbidden if the user doesn't have at least one of the required scopes.
 *
 * @param scopes - Array of acceptable scopes
 * @returns Express middleware function
 */
export function requireAnyScope(...scopes: string[]) {
  // Validate scopes input with Zod
  const scopesArraySchema = z.array(scopeSchema).min(1);
  const validationResult = scopesArraySchema.safeParse(scopes);
  if (!validationResult.success) {
    throw new Error("Invalid scopes parameter");
  }

  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;

    if (!auth) {
      throw new UnauthorizedError("Authentication required");
    }

    const hasRequiredScope = scopes.some(
      (scope) => auth.scopes && auth.scopes.includes(scope),
    );

    if (!hasRequiredScope) {
      throw new ForbiddenError(`Requires one of: ${scopes.join(", ")}`);
    }

    next();
  };
}
