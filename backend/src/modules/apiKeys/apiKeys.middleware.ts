import { Request, Response, NextFunction } from "express";
import { UnauthorizedError, ForbiddenError } from "../../common/errors/AppError.js";
import { verifyApiKey } from "./apiKeys.service.js";

declare module "express" {
  interface Request {
    apiKey?: {
      id: string;
      scopes: string[];
    };
  }
}

export async function apiKeyAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers["x-api-key"];

  let secret: string | undefined;

  if (authHeader?.startsWith("ApiKey ")) {
    secret = authHeader.substring(7).trim();
  } else if (typeof apiKeyHeader === "string") {
    secret = apiKeyHeader.trim();
  }

  if (!secret) {
    return next(new UnauthorizedError("Missing API key"));
  }

  try {
    const forwarded = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === "string"
        ? forwarded.split(",")[0]?.trim()
        : undefined;
    const ipAddress = forwardedIp || req.ip || req.socket?.remoteAddress;
    const apiKey = await verifyApiKey(secret, ipAddress ? { ipAddress } : {});
    req.apiKey = {
      id: apiKey.id,
      scopes: apiKey.scopes,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireApiKeyScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const apiKey = req.apiKey;

    if (!apiKey) {
      throw new UnauthorizedError("API key authentication required");
    }

    if (!apiKey.scopes.includes(scope)) {
      throw new ForbiddenError(`API key requires scope: ${scope}`);
    }

    next();
  };
}

export function requireAnyApiKeyScope(...scopes: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const apiKey = req.apiKey;

    if (!apiKey) {
      throw new UnauthorizedError("API key authentication required");
    }

    const hasScope = scopes.some((s) => apiKey.scopes.includes(s));

    if (!hasScope) {
      throw new ForbiddenError(
        `API key requires one of: ${scopes.join(", ")}`,
      );
    }

    next();
  };
}
