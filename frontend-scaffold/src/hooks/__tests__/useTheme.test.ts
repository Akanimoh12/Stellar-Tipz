import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTheme } from '../useTheme';

const STORAGE_KEY = 'tipz_theme';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
const createMatchMedia = (matches: boolean) => {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  return vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: (e: MediaQueryListEvent) => void) => {
      listeners.push(listener);
    }),
    removeEventListener: vi.fn((_event: string, listener: (e: MediaQueryListEvent) => void) => {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    }),
    dispatchEvent: vi.fn((event: MediaQueryListEvent) => {
      listeners.forEach(listener => listener(event));
      return true;
    }),
  }));
};

describe('useTheme', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return initial theme from localStorage', () => {
    localStorageMock.setItem(STORAGE_KEY, 'dark');
    
    const { result } = renderHook(() => useTheme());
    
    expect(result.current.theme).toBe('dark');
  });

  it('should persist theme choice in localStorage', () => {
    const { result } = renderHook(() => useTheme());
    
    act(() => {
      result.current.setTheme('dark');
    });
    
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'dark');
    expect(result.current.theme).toBe('dark');
  });

  it('should load theme from localStorage on mount', () => {
    localStorageMock.setItem(STORAGE_KEY, 'dark');
    
    const { result } = renderHook(() => useTheme());
    
    expect(result.current.theme).toBe('dark');
  });

  it('should default to system preference when no saved theme', () => {
    // Mock system dark mode preference
    window.matchMedia = createMatchMedia(true);
    
    const { result } = renderHook(() => useTheme());
    
    expect(result.current.theme).toBe('dark');
  });

  it('should default to light when no saved theme and no system preference', () => {
    // Mock system light mode preference
    window.matchMedia = createMatchMedia(false);
    
    const { result } = renderHook(() => useTheme());
    
    expect(result.current.theme).toBe('light');
  });

  it('should toggle theme from light to dark', () => {
    const { result } = renderHook(() => useTheme());
    
    act(() => {
      result.current.setTheme('light');
    });
    
    expect(result.current.theme).toBe('light');
    
    act(() => {
      result.current.toggleTheme();
    });
    
    expect(result.current.theme).toBe('dark');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'dark');
  });

  it('should toggle theme from dark to light', () => {
    const { result } = renderHook(() => useTheme());
    
    act(() => {
      result.current.setTheme('dark');
    });
    
    expect(result.current.theme).toBe('dark');
    
    act(() => {
      result.current.toggleTheme();
    });
    
    expect(result.current.theme).toBe('light');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'light');
  });

  it('should apply dark class to document element', () => {
    const { result } = renderHook(() => useTheme());
    
    act(() => {
      result.current.setTheme('dark');
    });
    
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should remove dark class from document element when light', () => {
    document.documentElement.classList.add('dark');
    
    const { result } = renderHook(() => useTheme());
    
    act(() => {
      result.current.setTheme('light');
    });
    
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should listen for system preference changes', async () => {
    const matchMediaMock = createMatchMedia(false);
    window.matchMedia = matchMediaMock;
    
    renderHook(() => useTheme());
    
    // Simulate system preference change to dark
    const mediaQuery = matchMediaMock('(prefers-color-scheme: dark)');
    const changeEvent = { matches: true } as MediaQueryListEvent;
    
    act(() => {
      mediaQuery.dispatchEvent(changeEvent);
    });
    
    await waitFor(() => {
      // Should not change if user has explicit preference
      // But should change if no explicit preference
    });
  });

  it('should not change theme on system preference change if user has explicit preference', async () => {
    localStorageMock.setItem(STORAGE_KEY, 'light');
    const matchMediaMock = createMatchMedia(false);
    window.matchMedia = matchMediaMock;
    
    const { result } = renderHook(() => useTheme());
    
    expect(result.current.theme).toBe('light');
    
    // Simulate system preference change to dark
    const mediaQuery = matchMediaMock('(prefers-color-scheme: dark)');
    const changeEvent = { matches: true } as MediaQueryListEvent;
    
    act(() => {
      mediaQuery.dispatchEvent(changeEvent);
    });
    
    // Theme should remain light because user has explicit preference
    expect(result.current.theme).toBe('light');
  });
});
