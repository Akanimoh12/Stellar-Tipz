import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '../utils/logger.js';

type ClientIdentity = {
  type: 'api-key' | 'user' | 'client-id' | 'user-agent' | 'ip';
  id: string;
};

type ReplacementResolver = string | ((req: Request) => string);

export type DeprecationOptions = {
  deprecationDate: Date;
  sunsetDate: Date;
  documentationUrl: string;
  replacement?: ReplacementResolver;
};

function identifyClient(req: Request): ClientIdentity {
  if (req.apiKey?.id) return { type: 'api-key', id: req.apiKey.id };
  if (req.user?.id) return { type: 'user', id: req.user.id };
  if (req.auth?.userId) return { type: 'user', id: req.auth.userId };

  const clientId = req.get('x-client-id')?.trim();
  if (clientId) return { type: 'client-id', id: clientId };

  const userAgent = req.get('user-agent')?.trim();
  if (userAgent) return { type: 'user-agent', id: userAgent };

  return { type: 'ip', id: req.ip || req.socket.remoteAddress || 'unknown' };
}

function structuredDate(date: Date): string {
  return `@${Math.floor(date.getTime() / 1_000)}`;
}

/** Adds standards-based deprecation metadata and records every call for migration tracking. */
export function deprecatedEndpoint(options: DeprecationOptions): RequestHandler {
  if (Number.isNaN(options.deprecationDate.getTime())) throw new Error('Invalid deprecation date');
  if (Number.isNaN(options.sunsetDate.getTime())) throw new Error('Invalid sunset date');
  if (options.sunsetDate <= options.deprecationDate) {
    throw new Error('Sunset date must be later than the deprecation date');
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const replacement =
      typeof options.replacement === 'function' ? options.replacement(req) : options.replacement;

    res.setHeader('Deprecation', structuredDate(options.deprecationDate));
    res.setHeader('Sunset', options.sunsetDate.toUTCString());
    res.append('Link', `<${options.documentationUrl}>; rel="deprecation"`);
    if (replacement) res.append('Link', `<${replacement}>; rel="successor-version"`);

    logger.warn(
      {
        event: 'deprecated_endpoint_used',
        method: req.method,
        path: req.originalUrl,
        requestId: req.id,
        client: identifyClient(req),
        deprecation: options.deprecationDate.toISOString(),
        sunset: options.sunsetDate.toISOString(),
        replacement,
      },
      'Deprecated API endpoint used',
    );

    next();
  };
}
