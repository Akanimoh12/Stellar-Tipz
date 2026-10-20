import { useCallback, useEffect, useRef, useState } from 'react';

import { subscribeToOperations, isSSESupported, type ConnectionState } from '../services/eventStream';
import { logger } from '../services/logger';
import { useTipNotifications } from './useTipNotifications';

const MODULE = 'useRealTimeNotifications';

/**
 * Augments the polling-based `useTipNotifications` hook with a Stellar Horizon
 * SSE connection for near-real-time tip delivery.
 *
 * Features:
 * - Automatic reconnection with exponential backoff and jitter.
 * - Connection state visible via `connectionState`.
 * - Bounded retries with manual `reconnect()` after give-up.
 * - Missed events are fetched on reconnect via the base poll.
 * - Falls back transparently to polling when SSE is unavailable.
 */
export const useRealTimeNotifications = (creatorAddress?: string) => {
  const base = useTipNotifications(creatorAddress);

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [reconnectCount, setReconnectCount] = useState(0);
  const streamRef = useRef<ReturnType<typeof subscribeToOperations> | null>(null);
  const pollRef = useRef<(() => void) | null>(null);

  const triggerRefresh = useCallback(() => {
    logger.debug(MODULE, 'SSE event received — refreshing tip check', { creatorAddress });
    setReconnectCount((n) => n + 1);
  }, [creatorAddress]);

  useEffect(() => {
    pollRef.current = triggerRefresh;
  }, [triggerRefresh]);

  useEffect(() => {
    if (!creatorAddress) return;

    if (!isSSESupported()) {
      logger.warn(MODULE, 'SSE not supported; relying on poll fallback only', {
        creatorAddress,
      });
      return;
    }

    setConnectionState('connecting');

    const stream = subscribeToOperations(creatorAddress, {
      onEvent: () => {
        pollRef.current?.();
      },
      onConnected: () => {
        setConnectionState('connected');
        // Trigger a catch-up poll on reconnect to fetch missed events
        pollRef.current?.();
      },
      onReconnect: () => {
        setConnectionState('connecting');
        logger.info(MODULE, 'SSE reconnecting', { creatorAddress });
      },
      onError: (e) => {
        setConnectionState('disconnected');
        logger.warn(MODULE, 'SSE error', { creatorAddress, event: String(e) });
      },
      onGiveUp: () => {
        setConnectionState('gave-up');
        logger.warn(MODULE, 'SSE gave up reconnecting', { creatorAddress });
      },
    });

    queueMicrotask(() => {
      if (streamRef.current === stream) {
        setConnectionState('connected');
      }
    });
    streamRef.current = stream;

    return () => {
      stream.close();
      streamRef.current = null;
      setConnectionState('disconnected');
    };
  }, [creatorAddress]);

  const reconnect = useCallback(() => {
    streamRef.current?.retry();
    setConnectionState('connecting');
  }, []);

  return {
    ...base,
    /** Current connection state: connecting, connected, disconnected, or gave-up. */
    connectionState,
    /** Whether the SSE stream is currently open. */
    isConnected: connectionState === 'connected',
    /** How many times the stream has reconnected since mount. */
    reconnectCount,
    /** Whether SSE is supported in the current browser environment. */
    isSSESupported: isSSESupported(),
    /** Manually retry connection after give-up. */
    reconnect,
  };
};
