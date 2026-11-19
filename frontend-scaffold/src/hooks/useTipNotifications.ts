import { useCallback, useEffect, useRef, useState } from "react";

import { stroopToXlm } from "@/helpers/format";
import { useContract } from "@/hooks/useContract";
import type { Tip } from "@/types/contract";
import {
  subscribeToOperations,
  isSSESupported,
  type ConnectionState,
} from "../services/eventStream";
import { logger } from '../services/logger';

const MODULE = "useTipNotifications";
const POLL_INTERVAL_MS = 15_000;
const SETTINGS_KEY = "tipz_notification_settings";
const SEEN_KEY_PREFIX = "tipz_seen_tip_ids:";
const UNSEEN_TIPS_KEY = "tipz_unseen_tips";

export interface TipNotificationSettings {
  sound: boolean;
  desktop: boolean;
}

const defaultSettings: TipNotificationSettings = {
  sound: true,
  desktop: false,
};

const readSettings = (): TipNotificationSettings => {
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    return stored
      ? { ...defaultSettings, ...JSON.parse(stored) }
      : defaultSettings;
  } catch {
    return defaultSettings;
  }
};

const writeSettings = (settings: TipNotificationSettings) => {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

const emitUnseenChange = () => {
  window.dispatchEvent(new Event("tipz:unseen-tips"));
};

const playTipSound = () => {
  const audio = new Audio(
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
  );
  audio.volume = 0.22;
  void audio.play().catch(() => undefined);
};

const formatTipTitle = (tip: Tip) => `New tip: ${stroopToXlm(tip.amount)} XLM`;

const formatTipBody = (tip: Tip) => {
  const tipper =
    tip.tipper.length > 12
      ? `${tip.tipper.slice(0, 6)}...${tip.tipper.slice(-6)}`
      : tip.tipper;
  if (tip.isEncrypted) return `${tipper}: 🔒 Encrypted message`;
  return tip.message ? `${tipper}: ${tip.message}` : `From ${tipper}`;
};

export const useNotificationPreferences = () => {
  const [settings, setSettings] = useState<TipNotificationSettings>(() =>
    readSettings(),
  );

  const updateSettings = useCallback(
    (next: Partial<TipNotificationSettings>) => {
      setSettings((current) => {
        const updated = { ...current, ...next };
        writeSettings(updated);
        return updated;
      });
    },
    [],
  );

  return { settings, updateSettings };
};

/**
 * Tip notifications for a creator, delivered by a polling loop that is
 * augmented with a Stellar Horizon SSE connection for near-real-time tips.
 *
 * This hook consolidates what used to be two separate hooks
 * (`useTipNotifications` + `useRealTimeNotifications`):
 *
 * - A polling loop checks `getRecentTips` every {@link POLL_INTERVAL_MS} and
 *   surfaces unseen tips via sound / desktop notifications.
 * - When SSE is available a persistent event stream is opened for
 *   `creatorAddress`; each incoming Horizon operation event triggers an
 *   immediate tip check, and a catch-up poll runs on (re)connect, so new
 *   tips are surfaced as soon as they land on-chain rather than waiting for
 *   the next scheduled poll interval.
 * - The stream reconnects with exponential backoff and jitter, reports its
 *   state via `connectionState`, gives up after bounded retries (restartable
 *   with `reconnect()`), and falls back transparently to polling alone when
 *   SSE is unavailable in the current environment.
 *
 * @param creatorAddress - Stellar address of the creator to watch for tips.
 */
export const useTipNotifications = (creatorAddress?: string) => {
  const { getRecentTips } = useContract();
  const { settings, updateSettings } = useNotificationPreferences();
  const [latestTip, setLatestTip] = useState<Tip | null>(null);
  const [unseenCount, setUnseenCount] = useState(() =>
    Number(window.localStorage.getItem(UNSEEN_TIPS_KEY) || "0"),
  );
  const initializedRef = useRef(false);

  // Near-real-time (SSE) state — merged from useRealTimeNotifications.
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    'disconnected',
  );
  const [reconnectCount, setReconnectCount] = useState(0);
  const streamRef = useRef<ReturnType<typeof subscribeToOperations> | null>(null);
  // Latest poll run, assigned by the polling effect below and invoked by SSE
  // events so a fresh on-chain tip is checked immediately instead of waiting
  // for the next scheduled tick.
  const pollRef = useRef<(() => void) | null>(null);

  const markSeen = useCallback(() => {
    setUnseenCount(0);
    window.localStorage.setItem(UNSEEN_TIPS_KEY, "0");
    emitUnseenChange();
  }, []);

  useEffect(() => {
    if (!creatorAddress) return;

    let cancelled = false;
    const seenKey = `${SEEN_KEY_PREFIX}${creatorAddress}`;

    const notify = async (tip: Tip) => {
      setLatestTip(tip);

      setUnseenCount((current) => {
        const next = current + 1;
        window.localStorage.setItem(UNSEEN_TIPS_KEY, String(next));
        emitUnseenChange();
        return next;
      });

      if (settings.sound) {
        playTipSound();
      }

      if (settings.desktop && "Notification" in window) {
        const show = () =>
          new Notification(formatTipTitle(tip), {
            body: formatTipBody(tip),
          });

        if (Notification.permission === "granted") {
          show();
        } else if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          if (permission === "granted") show();
        }
      }
    };

    const poll = async () => {
      try {
        const tips = await getRecentTips(creatorAddress, 10, 0);
        if (cancelled) return;

        const storedSeen = new Set(
          JSON.parse(window.localStorage.getItem(seenKey) || "[]") as number[],
        );

        if (!initializedRef.current) {
          window.localStorage.setItem(
            seenKey,
            JSON.stringify(tips.map((tip) => tip.id)),
          );
          initializedRef.current = true;
          return;
        }

        const newTips = tips
          .filter((tip) => !storedSeen.has(tip.id))
          .sort((a, b) => a.timestamp - b.timestamp);

        if (newTips.length === 0) return;

        window.localStorage.setItem(
          seenKey,
          JSON.stringify(
            [...storedSeen, ...newTips.map((tip) => tip.id)].slice(-100),
          ),
        );

        for (const tip of newTips) {
          await notify(tip);
        }
      } catch (error) {
        logger.error('hooks/useTipNotifications', 'Failed to poll new tips', undefined, error instanceof Error ? error : new Error(String(error)));
      }
    };

    pollRef.current = () => void poll();
    void poll();
    const intervalId = window.setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      pollRef.current = null;
      window.clearInterval(intervalId);
    };
  }, [creatorAddress, getRecentTips, settings.desktop, settings.sound]);

  // Horizon SSE stream: near-real-time tip delivery on top of polling.
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
        logger.debug(MODULE, 'SSE event received — refreshing tip check', {
          creatorAddress,
        });
        setReconnectCount((n) => n + 1);
        // Immediate tip check so new tips surface as soon as they land.
        pollRef.current?.();
      },
      onConnected: () => {
        setConnectionState('connected');
        // Catch-up poll on (re)connect to fetch missed events.
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
    latestTip,
    markSeen,
    settings,
    unseenCount,
    updateSettings,
    /** Current connection state: connecting, connected, disconnected, or gave-up. */
    connectionState,
    /** Whether the SSE stream is currently open. */
    isConnected: connectionState === 'connected',
    /** How many SSE events have been received since mount. */
    reconnectCount,
    /** Whether SSE is supported in the current browser environment. */
    isSSESupported: isSSESupported(),
    /** Manually retry the connection after give-up. */
    reconnect,
  };
};
