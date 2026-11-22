import { useEffect, useState } from 'react';

export type ReduceMotionPreference = 'auto' | 'always';

/**
 * Single source of truth for reduced-motion support.
 *
 * `useReducedMotionPreference.ts` used to duplicate this hook; the two were
 * consolidated here so every consumer shares one implementation, one media
 * query and one settings key.
 */
export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Mirrored onto `<html>` so plain CSS animations (Tailwind's `animate-*`,
 * keyframes and transitions) can honour the in-app preference too.
 */
export const REDUCED_MOTION_ATTRIBUTE = 'data-reduced-motion';

export const REDUCED_MOTION_SETTINGS_EVENT = 'tipz:settings-updated';

const SETTINGS_STORAGE_KEY = 'tipz_settings';

const getReducedMotionMediaQuery = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY);
};

/** Reads the explicit preference persisted by the settings page. */
export const readReduceMotionPreference = (): ReduceMotionPreference => {
  if (typeof window === 'undefined') {
    return 'auto';
  }

  try {
    const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) {
      return 'auto';
    }

    const parsed = JSON.parse(saved) as { reduceMotion?: string };
    return parsed?.reduceMotion === 'always' ? 'always' : 'auto';
  } catch {
    return 'auto';
  }
};

/** OS-level preference exposed by the `prefers-reduced-motion` media query. */
export const systemPrefersReducedMotion = (): boolean =>
  getReducedMotionMediaQuery()?.matches === true;

/**
 * Synchronous counterpart of {@link useReducedMotion} for non-React consumers
 * (imperative helpers such as confetti) that must not animate.
 */
export const shouldReduceMotionNow = (): boolean =>
  readReduceMotionPreference() === 'always' || systemPrefersReducedMotion();

export const notifyReducedMotionSettingsChanged = () => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new Event(REDUCED_MOTION_SETTINGS_EVENT));
};

/**
 * Reflects the resolved preference onto `<html data-reduced-motion="...">`
 * so CSS-only motion is suppressed for users who asked for reduced motion in
 * the app settings, not just for those with the OS-level preference.
 */
export const syncReducedMotionDocumentAttribute = (reduceMotion: boolean): void => {
  if (typeof document === 'undefined' || !document.documentElement) {
    return;
  }

  document.documentElement.setAttribute(REDUCED_MOTION_ATTRIBUTE, reduceMotion ? 'true' : 'false');
};

export const useReducedMotion = (): boolean => {
  const [reduceMotion, setReduceMotion] = useState(() => shouldReduceMotionNow());

  useEffect(() => {
    const updatePreference = () => {
      setReduceMotion(shouldReduceMotionNow());
    };

    const mediaQuery = getReducedMotionMediaQuery();

    const handleMediaChange = () => {
      if (readReduceMotionPreference() === 'auto') {
        updatePreference();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_STORAGE_KEY || event.key === null) {
        updatePreference();
      }
    };

    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else if (mediaQuery?.addListener) {
      mediaQuery.addListener(handleMediaChange);
    }

    window.addEventListener('storage', handleStorage);
    window.addEventListener(REDUCED_MOTION_SETTINGS_EVENT, updatePreference);

    return () => {
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else if (mediaQuery?.removeListener) {
        mediaQuery.removeListener(handleMediaChange);
      }

      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(REDUCED_MOTION_SETTINGS_EVENT, updatePreference);
    };
  }, []);

  useEffect(() => {
    syncReducedMotionDocumentAttribute(reduceMotion);
  }, [reduceMotion]);

  return reduceMotion;
};
