import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  REDUCED_MOTION_ATTRIBUTE,
  REDUCED_MOTION_MEDIA_QUERY,
  notifyReducedMotionSettingsChanged,
  readReduceMotionPreference,
  shouldReduceMotionNow,
  systemPrefersReducedMotion,
  useReducedMotion,
} from '../useReducedMotion';

const SETTINGS_STORAGE_KEY = 'tipz_settings';

interface MatchMediaController {
  setMatches: (matches: boolean) => void;
  emitChange: () => void;
  queries: string[];
}

const installMatchMedia = (initialMatches: boolean): MatchMediaController => {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const queries: string[] = [];

  window.matchMedia = vi.fn((query: string) => {
    queries.push(query);

    return {
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_event: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        listeners.delete(listener);
      },
      addListener: (listener: () => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: () => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: vi.fn(),
    };
  }) as unknown as typeof window.matchMedia;

  return {
    setMatches: (next: boolean) => {
      matches = next;
    },
    emitChange: () => {
      listeners.forEach((listener) => listener());
    },
    queries,
  };
};

const setSavedPreference = (reduceMotion: 'auto' | 'always') => {
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ reduceMotion }));
};

describe('useReducedMotion', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute(REDUCED_MOTION_ATTRIBUTE);
    installMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when nothing is saved and the system allows motion', () => {
    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
    expect(readReduceMotionPreference()).toBe('auto');
  });

  it('returns true when the system prefers reduced motion', () => {
    installMatchMedia(true);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
    expect(systemPrefersReducedMotion()).toBe(true);
  });

  it('returns true when the user selected "always", even if the system allows motion', () => {
    setSavedPreference('always');

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
    expect(systemPrefersReducedMotion()).toBe(false);
  });

  it('returns false when the user preference is auto and the system allows motion', () => {
    setSavedPreference('auto');

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('falls back to auto when the saved settings payload is unusable', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, 'not-json');

    expect(readReduceMotionPreference()).toBe('auto');
  });

  it('reads the OS preference with the shared media query', () => {
    const media = installMatchMedia(true);

    renderHook(() => useReducedMotion());

    expect(media.queries).toContain(REDUCED_MOTION_MEDIA_QUERY);
  });

  it('mirrors the resolved preference onto the document element for CSS-only motion', () => {
    installMatchMedia(true);

    renderHook(() => useReducedMotion());

    expect(document.documentElement.getAttribute(REDUCED_MOTION_ATTRIBUTE)).toBe('true');
  });

  it('updates when the settings page notifies a preference change', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      setSavedPreference('always');
      notifyReducedMotionSettingsChanged();
    });

    expect(result.current).toBe(true);
    expect(document.documentElement.getAttribute(REDUCED_MOTION_ATTRIBUTE)).toBe('true');
  });

  it('updates when another tab writes the settings key', () => {
    const { result } = renderHook(() => useReducedMotion());

    act(() => {
      setSavedPreference('always');
      window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_STORAGE_KEY }));
    });

    expect(result.current).toBe(true);
  });

  it('ignores storage events for unrelated keys', () => {
    const { result } = renderHook(() => useReducedMotion());

    act(() => {
      setSavedPreference('always');
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
    });

    expect(result.current).toBe(false);
  });

  it('follows system changes while the preference is auto', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      media.setMatches(true);
      media.emitChange();
    });

    expect(result.current).toBe(true);
  });

  it('lets an explicit user preference win over later system changes', () => {
    setSavedPreference('always');
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);

    act(() => {
      media.emitChange();
    });

    expect(result.current).toBe(true);
  });

  it('stops listening once the consumer unmounts', () => {
    installMatchMedia(false);
    const removeEventListener = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useReducedMotion());
    unmount();

    expect(removeEventListener).toHaveBeenCalled();
  });

  it('exposes the same answer synchronously for non-React consumers', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());

    expect(shouldReduceMotionNow()).toBe(result.current);

    setSavedPreference('always');
    expect(shouldReduceMotionNow()).toBe(true);
  });

  it('is the single reduced-motion hook implementation in the codebase', () => {
    const duplicateModule = path.resolve(process.cwd(), 'src/hooks/useReducedMotionPreference.ts');

    expect(existsSync(duplicateModule)).toBe(false);
  });
});
