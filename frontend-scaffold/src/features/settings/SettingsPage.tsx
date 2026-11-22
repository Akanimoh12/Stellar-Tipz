import React, { useEffect, useState } from "react";
import { Bell, Loader, Lock, Palette, RotateCcw } from "lucide-react";

import PageContainer from "@/components/layout/PageContainer";
import Button from "@/components/ui/Button";
import { isSupportedLanguage, type Language, useI18n } from "@/i18n";
import {
  notifyReducedMotionSettingsChanged,
  ReduceMotionPreference,
} from "@/hooks/useReducedMotion";
import { startOnboardingTour } from "@/hooks/useOnboarding";
import { logger } from "../../services/logger";
import SettingsPageSkeleton from "./SettingsPageSkeleton";

interface Settings {
  tipNotifications: boolean;
  leaderboardNotifications: boolean;
  systemNotifications: boolean;
  theme: "light" | "dark" | "auto";
  language: Language;
  currency: "USD" | "EUR" | "XLM";
  publicProfile: boolean;
  showOnLeaderboard: boolean;
  reduceMotion: ReduceMotionPreference;
}

const DEFAULT_SETTINGS: Settings = {
  tipNotifications: true,
  leaderboardNotifications: true,
  systemNotifications: true,
  theme: "auto",
  language: "en",
  currency: "USD",
  publicProfile: true,
  showOnLeaderboard: true,
  reduceMotion: "auto",
};

export const SettingsPage: React.FC = () => {
  const { language, languageNames, languages, setLanguage, t } = useI18n();
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULT_SETTINGS,
    language,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("tipz_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<Settings>;
        const parsedLanguage = isSupportedLanguage(parsed.language)
          ? parsed.language
          : language;

        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
          language: parsedLanguage,
        });

        if (parsedLanguage !== language) {
          setLanguage(parsedLanguage);
        }
      } catch (e) {
        logger.error(
          "features/settings/SettingsPage",
          "Failed to load settings",
          undefined,
          e instanceof Error ? e : new Error(String(e)),
        );
      }
    }
    setIsLoading(false);
    // Load persisted settings once; language changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      language,
    }));
  }, [language]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem("tipz_settings", JSON.stringify(settings));
      notifyReducedMotionSettingsChanged();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm(t("settings.resetConfirm"))) {
      setSettings({
        ...DEFAULT_SETTINGS,
        language,
      });
      localStorage.removeItem("tipz_settings");
      notifyReducedMotionSettingsChanged();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleToggle = (key: keyof Settings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: typeof prev[key] === "boolean" ? !prev[key] : prev[key],
    }));
  };

  const handleChange = <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => {
    if (key === "language") {
      setLanguage(value as Language);
    }

    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  if (isLoading) {
    return <SettingsPageSkeleton />;
  }

  return (
    <PageContainer
      maxWidth="md"
      ariaLabel={t("settings.content")}
      className="min-h-screen bg-gray-50 py-8"
    >
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">{t("settings.title")}</h1>

        {saveSuccess && (
          <div role="status" aria-live="polite" className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700">{t("settings.saved")}</p>
          </div>
        )}

        <section role="region" aria-labelledby="notifications-heading" className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="w-5 h-5 text-blue-600" />
              <h2 id="notifications-heading" className="text-xl font-semibold">
                {t("settings.notifications")}
              </h2>
            </div>
            <p className="text-sm text-gray-600">
              {t("settings.notificationsDescription")}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("settings.tipNotifications")}</span>
              <input
                type="checkbox"
                checked={settings.tipNotifications}
                onChange={() => handleToggle("tipNotifications")}
                className="w-4 h-4 rounded border-2 border-black accent-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("settings.leaderboardChanges")}</span>
              <input
                type="checkbox"
                checked={settings.leaderboardNotifications}
                onChange={() => handleToggle("leaderboardNotifications")}
                className="w-4 h-4 rounded border-2 border-black accent-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("settings.systemUpdates")}</span>
              <input
                type="checkbox"
                checked={settings.systemNotifications}
                onChange={() => handleToggle("systemNotifications")}
                className="w-4 h-4 rounded border-2 border-black accent-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              />
            </label>
          </div>
        </section>

        <section role="region" aria-labelledby="display-heading" className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3 mb-4">
              <Palette className="w-5 h-5 text-purple-600" />
              <h2 id="display-heading" className="text-xl font-semibold">
                {t("settings.display")}
              </h2>
            </div>
            <p className="text-sm text-gray-600">
              {t("settings.displayDescription")}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                {t("settings.theme")}
              </label>
              <select
                value={settings.theme}
                onChange={(e) =>
                  handleChange("theme", e.target.value as Settings["theme"])
                }
                className="w-full px-3 py-2 border-2 border-black rounded-lg bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
              >
                <option value="light">{t("common.light")}</option>
                <option value="dark">{t("common.dark")}</option>
                <option value="auto">{t("common.auto")}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                {t("settings.language")}
              </label>
              <select
                value={settings.language}
                onChange={(e) =>
                  handleChange("language", e.target.value as Language)
                }
                className="w-full px-3 py-2 border-2 border-black rounded-lg bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
              >
                {languages.map((option) => (
                  <option key={option} value={option}>
                    {languageNames[option]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                {t("settings.currency")}
              </label>
              <select
                value={settings.currency}
                onChange={(e) =>
                  handleChange("currency", e.target.value as Settings["currency"])
                }
                className="w-full px-3 py-2 border-2 border-black rounded-lg bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="XLM">XLM</option>
              </select>
            </div>
          </div>
        </section>

        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3 mb-4">
              <RotateCcw className="w-5 h-5 text-teal-600" />
              <h2 className="text-xl font-semibold">{t("settings.motion")}</h2>
            </div>
            <p className="text-sm text-gray-600">
              {t("settings.motionDescription")}
            </p>
          </div>

          <div className="p-6 space-y-3">
            <label className="flex items-center justify-between gap-3 border-2 border-black px-3 py-2">
              <span className="text-sm font-medium">{t("settings.useDeviceMotion")}</span>
              <input
                type="radio"
                name="reduceMotion"
                value="auto"
                checked={settings.reduceMotion === "auto"}
                onChange={() => handleChange("reduceMotion", "auto")}
                className="h-4 w-4 border-2 border-black accent-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              />
            </label>
            <label className="flex items-center justify-between gap-3 border-2 border-black px-3 py-2">
              <span className="text-sm font-medium">{t("settings.alwaysReduceMotion")}</span>
              <input
                type="radio"
                name="reduceMotion"
                value="always"
                checked={settings.reduceMotion === "always"}
                onChange={() => handleChange("reduceMotion", "always")}
                className="h-4 w-4 border-2 border-black accent-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              />
            </label>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3 mb-4">
              <Palette className="w-5 h-5 text-teal-600" />
              <h2 className="text-xl font-semibold">{t("settings.onboarding")}</h2>
            </div>
            <p className="text-sm text-gray-600">
              {t("settings.onboardingDescription")}
            </p>
          </div>

          <div className="p-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => startOnboardingTour()}
            >
              {t("settings.replayOnboarding")}
            </Button>
          </div>
        </div>

        <section role="region" aria-labelledby="privacy-heading" className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-5 h-5 text-green-600" />
              <h2 id="privacy-heading" className="text-xl font-semibold">
                {t("settings.privacy")}
              </h2>
            </div>
            <p className="text-sm text-gray-600">
              {t("settings.privacyDescription")}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("settings.publicProfile")}</span>
              <input
                type="checkbox"
                checked={settings.publicProfile}
                onChange={() => handleToggle("publicProfile")}
                className="w-4 h-4 rounded border-2 border-black accent-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("settings.showOnLeaderboard")}</span>
              <input
                type="checkbox"
                checked={settings.showOnLeaderboard}
                onChange={() => handleToggle("showOnLeaderboard")}
                className="w-4 h-4 rounded border-2 border-black accent-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              />
            </label>
          </div>
        </section>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("common.saveSettings")
            )}
          </button>

          <button
            onClick={handleReset}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4 rounded border-2 border-black accent-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" />
            {t("common.resetToDefaults")}
          </button>
        </div>
      </div>
    </PageContainer>
  );
};

export default SettingsPage;
