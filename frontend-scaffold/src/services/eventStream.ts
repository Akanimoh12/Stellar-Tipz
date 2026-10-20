import { env } from '../helpers/env';
import { logger } from './logger';

const MODULE = 'eventStream';

// ── types ─────────────────────────────────────────────────────────────────────

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'gave-up';

export interface StreamEvent {
  /** Horizon operation type, e.g. "invoke_host_function". */
  type: string;
  data: Record<string, unknown>;
}

export type StreamCallback = (event: StreamEvent) => void;
export type StreamErrorCallback = (error: Event) => void;

export interface StreamOptions {
  onEvent: StreamCallback;
  onReconnect?: () => void;
  onConnected?: () => void;
  onError?: StreamErrorCallback;
  onGiveUp?: () => void;
  /** Cap for exponential backoff in ms (default: 30_000). */
  maxBackoffMs?: number;
  /** Max consecutive failures before giving up (default: 8). */
  maxRetries?: number;
}

export interface EventStream {
  close(): void;
  /** Manually restart after give-up. */
  retry(): void;
}

// ── constants ─────────────────────────────────────────────────────────────────

const MIN_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;
const DEFAULT_MAX_RETRIES = 8;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Returns true when the browser supports the EventSource API. */
export const isSSESupported = (): boolean => typeof EventSource !== 'undefined';

/** Add jitter: multiply backoff by random factor in [0.5, 1.0) to avoid thundering herd. */
function withJitter(ms: number): number {
  return Math.floor(ms * (0.5 + Math.random() * 0.5));
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Opens a Horizon SSE stream for `address`'s operations.
 *
 * Behaviour:
 * - Fires `onEvent` with each parsed Horizon operation record.
 * - Reconnects automatically on error with exponential backoff + jitter.
 * - Stops reconnecting after `maxRetries` consecutive failures, fires `onGiveUp`.
 * - Pauses when the page is hidden (Page Visibility API) and resumes when
 *   the page becomes visible again — conserves battery on mobile.
 * - Returns a handle with `.close()` to stop and `.retry()` to restart after give-up.
 *
 * @param address - Stellar account address to watch.
 * @param options - Callbacks and configuration.
 */
export const subscribeToOperations = (
  address: string,
  options: StreamOptions,
): EventStream => {
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const url = `${env.horizonUrl}/accounts/${address}/operations?cursor=now&order=asc&limit=1`;

  let source: EventSource | null = null;
  let backoffMs = MIN_BACKOFF_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let paused = false;
  let retryCount = 0;
  let givenUp = false;

  const clearTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed || paused || givenUp) return;

    if (retryCount >= maxRetries) {
      givenUp = true;
      logger.warn(MODULE, 'SSE gave up after max retries', { address, retryCount });
      options.onGiveUp?.();
      return;
    }

    clearTimer();
    const delay = withJitter(backoffMs);
    reconnectTimer = setTimeout(() => {
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      options.onReconnect?.();
      connect();
    }, delay);
  };

  const connect = () => {
    if (closed || paused) return;
    if (source) {
      source.close();
      source = null;
    }

    logger.debug(MODULE, 'opening SSE connection', { address, url });
    source = new EventSource(url);

    source.onopen = () => {
      options.onConnected?.();
    };

    source.onmessage = (e: MessageEvent<string>) => {
      backoffMs = MIN_BACKOFF_MS; // reset backoff on successful message
      retryCount = 0; // reset retry count on success
      try {
        const data = JSON.parse(e.data) as Record<string, unknown>;
        options.onEvent({
          type: typeof data.type === 'string' ? data.type : 'operation',
          data,
        });
      } catch (parseErr) {
        logger.warn(MODULE, 'failed to parse SSE frame', { raw: e.data }, parseErr as Error);
      }
    };

    source.onerror = (e) => {
      retryCount++;
      logger.warn(MODULE, 'SSE connection error; scheduling reconnect', { address, backoffMs, retryCount });
      options.onError?.(e);
      source?.close();
      source = null;
      scheduleReconnect();
    };
  };

  // Pause when tab is hidden; resume when it becomes visible again.
  const onVisibilityChange = () => {
    if (document.hidden) {
      paused = true;
      clearTimer();
      source?.close();
      source = null;
      logger.debug(MODULE, 'SSE paused (page hidden)', { address });
    } else {
      paused = false;
      backoffMs = MIN_BACKOFF_MS;
      retryCount = 0;
      givenUp = false;
      logger.debug(MODULE, 'SSE resuming (page visible)', { address });
      connect();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  connect();

  return {
    close() {
      closed = true;
      clearTimer();
      source?.close();
      source = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      logger.debug(MODULE, 'SSE stream closed', { address });
    },
    retry() {
      if (!givenUp) return;
      givenUp = false;
      retryCount = 0;
      backoffMs = MIN_BACKOFF_MS;
      connect();
    },
  };
};
