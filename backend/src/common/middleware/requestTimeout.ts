import type { NextFunction, Request, Response } from "express";
import { config } from "../../config/index.js";
import { logger } from "../utils/logger.js";

/**
 * Request timeout + client-disconnect AbortSignal middleware (issue #090).
 *
 * - Creates a per-request AbortController and exposes its signal as `req.signal`.
 *   Upstream fetch/RPC calls should pass this signal via fetchWithTimeout({ parentSignal: req.signal })
 *   or withTimeoutAndSignal(..., req.signal). When the client disconnects, the signal aborts,
 *   cancelling in-flight work.
 * - Enforces a server-level request timeout (config.timeouts.requestMs, default 30s).
 *   If the timeout fires before the response is sent, it responds 503 with code REQUEST_TIMEOUT
 *   and aborts the controller so upstream work is cancelled.
 */

export function requestTimeoutAndSignal(req: Request, res: Response, next: NextFunction): void {
  const timeoutMs = (config as unknown as { timeouts?: { requestMs: number } })?.timeouts?.requestMs ?? 30_000;
  const controller = new AbortController();
  // Expose signal on request for downstream handlers
  (req as unknown as { signal: AbortSignal }).signal = controller.signal;

  let timedOut = false;
  const timeout = setTimeout(() => {
    if (res.headersSent || res.writableEnded) return;
    timedOut = true;
    logger.warn({ path: req.path, method: req.method, timeoutMs }, "Request timed out — returning 503");
    controller.abort(new DOMException("Request timeout", "TimeoutError"));
    if (!res.headersSent) {
      res.status(503).json({
        error: {
          code: "REQUEST_TIMEOUT",
          message: `Request timed out after ${timeoutMs}ms`,
          requestId: (req as unknown as { id?: string }).id,
        },
      });
    }
  }, timeoutMs);

  // Client disconnect -> abort upstream
  const onClose = () => {
    if (!res.writableEnded && !timedOut) {
      logger.debug({ path: req.path, method: req.method }, "Client disconnected — aborting upstream");
      controller.abort(new DOMException("Client disconnected", "AbortError"));
    }
    cleanup();
  };

  const cleanup = () => {
    clearTimeout(timeout);
    req.removeListener("close", onClose);
    res.removeListener("finish", cleanup);
    res.removeListener("close", cleanup);
  };

  req.on("close", onClose);
  res.on("finish", cleanup);
  res.on("close", cleanup);

  // If response already wants to abort upstream on its own close, ensure controller abort doesn't double-send
  // Pass through
  next();
}
