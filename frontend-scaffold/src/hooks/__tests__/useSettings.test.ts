import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSettings, Settings } from '../useSettings';
import { secureStorage } from '@/services/secureStorage';
import { logger } from '@/services/logger';

vi.mock('@/services/secureStorage');
vi.mock('@/services/logger');

const mockSecureStorage = vi.mocked(secureStorage);
const mockLogger = vi.mocked(logger);

describe('useSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSecureStorage.get.mockResolvedValue(null);
    mockSecureStorage.set.mockResolvedValue(undefined);
    mockSecureStorage.remove.mockImplementation(() => {
      // no-op
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return initial state with default settings', async () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings).toEqual({
      tipNotifications: true,
      leaderboardNotifications: true,
      systemNotifications: true,
      theme: 'auto',
      language: 'en',
      currency: 'USD',
      publicProfile: true,
      showOnLeaderboard: true,
    });
  });

  it('should load settings from secure storage', async () => {
    const savedSettings: Partial<Settings> = {
      theme: 'dark',
      language: 'es',
      currency: 'EUR',
    };

    mockSecureStorage.get.mockResolvedValue(savedSettings);

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings.theme).toBe('dark');
    expect(result.current.settings.language).toBe('es');
    expect(result.current.settings.currency).toBe('EUR');
    expect(result.current.settings.tipNotifications).toBe(true); // from defaults
  });

  it('should update settings and persist to storage', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const updates: Partial<Settings> = {
      theme: 'light',
      tipNotifications: false,
    };

    await act(async () => {
      await result.current.updateSettings(updates);
    });

    expect(result.current.settings.theme).toBe('light');
    expect(result.current.settings.tipNotifications).toBe(false);
    expect(mockSecureStorage.set).toHaveBeenCalledWith('tipz_settings', expect.objectContaining(updates));
  });

  it('should handle storage error on load', async () => {
    const error = new Error('Storage unavailable');
    mockSecureStorage.get.mockRejectedValue(error);

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings).toEqual({
      tipNotifications: true,
      leaderboardNotifications: true,
      systemNotifications: true,
      theme: 'auto',
      language: 'en',
      currency: 'USD',
      publicProfile: true,
      showOnLeaderboard: true,
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      'hooks/useSettings',
      'Failed to load settings',
      undefined,
      error,
    );
  });

  it('should handle storage error on update', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const error = new Error('Write failed');
    mockSecureStorage.set.mockRejectedValue(error);

    await act(async () => {
      await result.current.updateSettings({ theme: 'dark' });
    });

    expect(result.current.settings.theme).toBe('dark');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'hooks/useSettings',
      'Failed to save settings',
      undefined,
      error,
    );
  });

  it('should reset settings to defaults and remove from storage', async () => {
    const savedSettings: Partial<Settings> = { theme: 'dark', language: 'fr' };
    mockSecureStorage.get.mockResolvedValue(savedSettings);

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings.theme).toBe('dark');

    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.settings).toEqual({
      tipNotifications: true,
      leaderboardNotifications: true,
      systemNotifications: true,
      theme: 'auto',
      language: 'en',
      currency: 'USD',
      publicProfile: true,
      showOnLeaderboard: true,
    });
    expect(mockSecureStorage.remove).toHaveBeenCalledWith('tipz_settings');
  });

  it('should handle error on reset', () => {
    const error = new Error('Remove failed');
    mockSecureStorage.remove.mockImplementation(() => {
      throw error;
    });

    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.resetSettings();
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      'hooks/useSettings',
      'Failed to reset settings',
      undefined,
      error,
    );
  });

  it('should merge saved settings with defaults', async () => {
    const partialSettings: Partial<Settings> = {
      theme: 'light',
    };
    mockSecureStorage.get.mockResolvedValue(partialSettings);

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.settings).toMatchObject({
      theme: 'light',
      language: 'en',
      currency: 'USD',
      tipNotifications: true,
    });
  });

  it('should allow multiple settings updates', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.updateSettings({ theme: 'dark' });
    });

    expect(result.current.settings.theme).toBe('dark');

    await act(async () => {
      await result.current.updateSettings({ language: 'es' });
    });

    expect(result.current.settings.theme).toBe('dark');
    expect(result.current.settings.language).toBe('es');
  });
});
