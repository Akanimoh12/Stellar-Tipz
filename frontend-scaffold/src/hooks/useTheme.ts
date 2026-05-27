import { useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

interface UseThemeReturn {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'tipz_theme';

export const useTheme = (): UseThemeReturn => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored as ThemeMode;
      }
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return 'light';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    
    const resolveTheme = (currentTheme: ThemeMode) => {
      if (currentTheme === 'system') {
        return mediaQuery?.matches ? 'dark' : 'light';
      }
      return currentTheme as 'light' | 'dark';
    };

    const newResolvedTheme = resolveTheme(theme);
    const timeoutId = window.setTimeout(() => {
      setResolvedTheme(newResolvedTheme);
    }, 0);

    const root = document.documentElement;
    root.classList.toggle('dark', newResolvedTheme === 'dark');

    return () => window.clearTimeout(timeoutId);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mediaQuery) return;
    
    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        const root = document.documentElement;
        const newResolvedTheme = e.matches ? 'dark' : 'light';
        root.classList.toggle('dark', newResolvedTheme === 'dark');
        setResolvedTheme(newResolvedTheme);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    if (newTheme === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, newTheme);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const currentTheme = theme === 'system' ? resolvedTheme : theme;
    setTheme(currentTheme === 'light' ? 'dark' : 'light');
  }, [resolvedTheme, setTheme, theme]);

  return { theme, resolvedTheme, setTheme, toggleTheme };
};
