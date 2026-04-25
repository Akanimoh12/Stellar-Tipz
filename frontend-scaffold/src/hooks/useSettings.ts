import { useState, useEffect } from 'react';
import { secureStorage } from '../services/secureStorage';

export interface Settings {
    tipNotifications: boolean;
    leaderboardNotifications: boolean;
    systemNotifications: boolean;
    theme: 'light' | 'dark' | 'auto';
    language: 'en' | 'es' | 'fr';
    currency: 'USD' | 'EUR' | 'XLM';
    publicProfile: boolean;
    showOnLeaderboard: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    tipNotifications: true,
    leaderboardNotifications: true,
    systemNotifications: true,
    theme: 'auto',
    language: 'en',
    currency: 'USD',
    publicProfile: true,
    showOnLeaderboard: true,
};

const STORAGE_KEY = 'tipz_settings';

export const useSettings = () => {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);

    // Load settings from localStorage on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const saved = await secureStorage.get(STORAGE_KEY);
                if (saved) {
                    setSettings({ ...DEFAULT_SETTINGS, ...saved });
                }
            } catch (error) {
                console.error('Failed to load settings:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadSettings();
    }, []);

    const updateSettings = async (updates: Partial<Settings>) => {
        const newSettings = { ...settings, ...updates };
        setSettings(newSettings);
        try {
            await secureStorage.set(STORAGE_KEY, newSettings);
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    };

    const resetSettings = () => {
        setSettings(DEFAULT_SETTINGS);
        try {
            secureStorage.remove(STORAGE_KEY);
        } catch (error) {
            console.error('Failed to reset settings:', error);
        }
    };

    return {
        settings,
        updateSettings,
        resetSettings,
        isLoading,
    };
};

export default useSettings;
