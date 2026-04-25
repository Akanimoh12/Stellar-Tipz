import { useState, useEffect } from 'react';

export interface OfflineStatus {
  /** True when navigator.onLine is false or an 'offline' event has fired. */
  isOffline: boolean;
  /** Convenience inverse of isOffline. */
  isOnline: boolean;
}

/**
 * Tracks the browser's online/offline state reactively.
 *
 * Reads the initial value from `navigator.onLine` then subscribes to the
 * `online` / `offline` window events for subsequent updates.
 */
export function useOfflineStatus(): OfflineStatus {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOffline, isOnline: !isOffline };
}
