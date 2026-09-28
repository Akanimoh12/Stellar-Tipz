/**
 * #1311 — Hook for state-modifying actions requiring network connectivity.
 *
 * Ensures network-dependent operations (such as tipping, signing, and contract calls)
 * are cleanly disabled with an explanatory reason when offline, rather than failing abruptly.
 */

import { useCallback } from 'react';
import { useOfflineStatus } from './useOfflineStatus';

export interface NetworkActionGuard {
  isOffline: boolean;
  disabled: boolean;
  disabledReason?: string;
  execute: <T>(action: () => Promise<T>) => Promise<T | undefined>;
}

export const OFFLINE_ACTION_DISABLED_MESSAGE =
  'Internet connection required. Actions cannot be performed while offline. Blockchain transactions cannot be queued offline to prevent sequence desynchronization and stale fee failures.';

export function useNetworkAction(
  customDisabledMessage: string = OFFLINE_ACTION_DISABLED_MESSAGE,
): NetworkActionGuard {
  const { isOffline } = useOfflineStatus();

  const execute = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      if (isOffline) {
        throw new Error(customDisabledMessage);
      }
      return action();
    },
    [isOffline, customDisabledMessage],
  );

  return {
    isOffline,
    disabled: isOffline,
    disabledReason: isOffline ? customDisabledMessage : undefined,
    execute,
  };
}
