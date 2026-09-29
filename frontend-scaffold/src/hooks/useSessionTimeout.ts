import { useEffect, useRef, useCallback } from "react";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 5 * 60 * 1000; // warn 5 minutes before expiry

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "pointermove",
] as const;

interface UseSessionTimeoutOptions {
  /** Whether a session is currently active (e.g. wallet connected). */
  isActive: boolean;
  /** Called when the session expires due to inactivity. */
  onExpire: () => void;
  /** Called when the session is about to expire (5 min warning). */
  onWarn?: () => void;
  /** Inactivity timeout in ms. Defaults to 30 minutes. */
  timeoutMs?: number;
}

/**
 * Manages session expiry for an active wallet connection.
 * Resets the inactivity timer on user activity events and on tab focus.
 * Triggers onWarn 5 minutes before expiry and onExpire at timeout.
 */
export function useSessionTimeout({
  isActive,
  onExpire,
  onWarn,
  timeoutMs = SESSION_TIMEOUT_MS,
}: UseSessionTimeoutOptions): void {
  const expireTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExpireRef = useRef(onExpire);
  const onWarnRef = useRef(onWarn);

  // Keep refs current so timers don't capture stale closures
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    onWarnRef.current = onWarn;
  }, [onWarn]);

  const clearTimers = useCallback(() => {
    if (expireTimer.current !== null) clearTimeout(expireTimer.current);
    if (warnTimer.current !== null) clearTimeout(warnTimer.current);
    expireTimer.current = null;
    warnTimer.current = null;
  }, []);

  const resetTimers = useCallback(() => {
    clearTimers();
    const warningDelay = timeoutMs - WARNING_BEFORE_MS;
    if (warningDelay > 0) {
      warnTimer.current = setTimeout(() => {
        onWarnRef.current?.();
      }, warningDelay);
    }
    expireTimer.current = setTimeout(() => {
      onExpireRef.current();
    }, timeoutMs);
  }, [clearTimers, timeoutMs]);

  useEffect(() => {
    if (!isActive) {
      clearTimers();
      return;
    }

    resetTimers();

    const handleActivity = () => resetTimers();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    // When the tab is hidden start a tight expiry timer; restore full timer on
    // visibility so backgrounded tabs don't hold connections open indefinitely.
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearTimers();
        expireTimer.current = setTimeout(() => {
          onExpireRef.current();
        }, timeoutMs);
      } else {
        resetTimers();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Note: expiry on page unload is intentionally NOT wired here. Ending the
    // session on beforeunload would revoke tokens on every navigation/close
    // and defeat refresh-token persistence across reloads (issue #1307).
    return () => {
      clearTimers();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isActive, resetTimers, clearTimers, timeoutMs]);
}
