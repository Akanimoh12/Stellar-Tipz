import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import {
  isFeatureEnabled,
  getFeatureValue,
  subscribeToFlagChanges,
  getFlagDebugInfo,
  type FlagValue,
  type FlagDebugInfo,
} from '@/services/featureFlags';

export function useFeatureFlag(name: string, defaultValue: boolean = false): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToFlagChanges(onStoreChange),
    [],
  );
  const getSnapshot = useCallback(
    () => isFeatureEnabled(name, defaultValue),
    [name, defaultValue],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useFeatureValue(name: string, defaultValue?: FlagValue): FlagValue | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToFlagChanges(onStoreChange),
    [],
  );
  const getSnapshot = useCallback(
    () => getFeatureValue(name, defaultValue),
    [name, defaultValue],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useFeatureFlagDebug(): FlagDebugInfo {
  const [info, setInfo] = useState(() => getFlagDebugInfo());

  useEffect(() => {
    const unsub = subscribeToFlagChanges(() => {
      setInfo(getFlagDebugInfo());
    });
    return unsub;
  }, []);

  return info;
}

const listeners: Record<string, Set<() => void>> = {};

export function notifyFlagChange(name: string): void {
  listeners[name]?.forEach((listener) => listener());
}

export function useFlagChange(name: string): void {
  const callback = useCallback(() => {
    notifyFlagChange(name);
  }, [name]);

  useEffect(() => {
    if (!listeners[name]) {
      listeners[name] = new Set();
    }
    listeners[name].add(callback);
    return () => {
      listeners[name]?.delete(callback);
    };
  }, [name, callback]);
}
