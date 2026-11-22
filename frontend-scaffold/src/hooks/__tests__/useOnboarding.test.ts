import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOnboarding, startOnboardingTour } from '../useOnboarding';

describe('useOnboarding (#1518)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('loading and initial state', () => {
    it('initializes with isTourOpen = true and completed = false when storage has no record', () => {
      const { result } = renderHook(() => useOnboarding());

      expect(result.current.completed).toBe(false);
      expect(result.current.isTourOpen).toBe(true);
    });

    it('initializes with isTourOpen = false and completed = true when onboarding was completed', () => {
      window.localStorage.setItem('tipz_onboarding', 'completed');

      const { result } = renderHook(() => useOnboarding());

      expect(result.current.completed).toBe(true);
      expect(result.current.isTourOpen).toBe(false);
    });

    it('handles localStorage read errors gracefully and falls back to default state', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      const { result } = renderHook(() => useOnboarding());

      expect(result.current.completed).toBe(false);
      expect(result.current.isTourOpen).toBe(true);

      getItemSpy.mockRestore();
    });
  });

  describe('success path - tour actions', () => {
    it('completes the tour and persists completion in localStorage', () => {
      const { result } = renderHook(() => useOnboarding());

      act(() => {
        result.current.completeTour();
      });

      expect(result.current.completed).toBe(true);
      expect(result.current.isTourOpen).toBe(false);
      expect(window.localStorage.getItem('tipz_onboarding')).toBe('completed');
    });

    it('skips the tour and delegates to completion', () => {
      const { result } = renderHook(() => useOnboarding());

      act(() => {
        result.current.skipTour();
      });

      expect(result.current.completed).toBe(true);
      expect(result.current.isTourOpen).toBe(false);
      expect(window.localStorage.getItem('tipz_onboarding')).toBe('completed');
    });

    it('resets the tour, clearing localStorage and opening tour again', () => {
      window.localStorage.setItem('tipz_onboarding', 'completed');
      const { result } = renderHook(() => useOnboarding());

      expect(result.current.completed).toBe(true);
      expect(result.current.isTourOpen).toBe(false);

      act(() => {
        result.current.resetTour();
      });

      expect(result.current.completed).toBe(false);
      expect(result.current.isTourOpen).toBe(true);
      expect(window.localStorage.getItem('tipz_onboarding')).toBeNull();
    });

    it('re-opens tour and resets completed status when startOnboardingTour() is called', () => {
      window.localStorage.setItem('tipz_onboarding', 'completed');
      const { result } = renderHook(() => useOnboarding());

      expect(result.current.completed).toBe(true);
      expect(result.current.isTourOpen).toBe(false);

      act(() => {
        startOnboardingTour();
      });

      expect(result.current.completed).toBe(false);
      expect(result.current.isTourOpen).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles localStorage.setItem throwing an error during completeTour without throwing', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const { result } = renderHook(() => useOnboarding());

      expect(() => {
        act(() => {
          result.current.completeTour();
        });
      }).not.toThrow();

      // State is still updated in memory
      expect(result.current.completed).toBe(true);
      expect(result.current.isTourOpen).toBe(false);

      setItemSpy.mockRestore();
    });

    it('handles localStorage.removeItem throwing an error during resetTour without throwing', () => {
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage write disabled');
      });

      const { result } = renderHook(() => useOnboarding());

      expect(() => {
        act(() => {
          result.current.resetTour();
        });
      }).not.toThrow();

      // State is still reset in memory
      expect(result.current.completed).toBe(false);
      expect(result.current.isTourOpen).toBe(true);

      removeItemSpy.mockRestore();
    });
  });

  describe('cleanup path', () => {
    it('removes event listener for onboarding-start when unmounted', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useOnboarding());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'tipz:onboarding-start',
        expect.any(Function)
      );
    });

    it('does not update state when startOnboardingTour() is dispatched after unmount', () => {
      const { unmount } = renderHook(() => useOnboarding());

      unmount();

      expect(() => {
        startOnboardingTour();
      }).not.toThrow();
    });
  });
});
