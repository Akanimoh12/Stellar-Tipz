import i18n, { type BackendModule, type ResourceKey } from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";

export const LANGUAGE_STORAGE_KEY = "tipz_lang";
export const fallbackLanguage = "en";
export const supportedLanguages = ["en", "es", "fr", "pt", "zh", "ar"] as const;

export type Language = (typeof supportedLanguages)[number];

export const languageNames: Record<Language, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  zh: "中文",
  ar: "العربية",
};

const rtlLanguages = new Set<string>(["ar", "fa", "he", "ur"]);

const languageLoaders: Record<Language, () => Promise<{ default: ResourceKey }>> = {
  en: () => Promise.resolve({ default: en }),
  es: () => import("./es.json"),
  fr: () => import("./fr.json"),
  pt: () => import("./pt.json"),
  zh: () => import("./zh.json"),
  ar: () => import("./ar.json"),
};

export const isSupportedLanguage = (
  value: string | null | undefined,
): value is Language =>
  supportedLanguages.includes(value?.toLowerCase().split("-")[0] as Language);

export const normalizeLanguage = (
  value: string | null | undefined,
): Language | null => {
  if (!value) return null;

  const normalized = value.toLowerCase().replace("_", "-");
  const baseLanguage = normalized.split("-")[0];

  return isSupportedLanguage(baseLanguage) ? baseLanguage : null;
};

const getStoredLanguage = (): Language | null => {
  if (typeof window === "undefined") return null;
  return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
};

export const detectPreferredLanguage = (): Language => {
  if (typeof window === "undefined") return fallbackLanguage;

  const storedLanguage = getStoredLanguage();
  if (storedLanguage) return storedLanguage;

  const browserLanguages =
    window.navigator.languages?.length > 0
      ? window.navigator.languages
      : [window.navigator.language];

  for (const browserLanguage of browserLanguages) {
    const supportedLanguage = normalizeLanguage(browserLanguage);
    if (supportedLanguage) return supportedLanguage;
  }

  return fallbackLanguage;
};

export const isRtlLanguage = (language: string | null | undefined) =>
  rtlLanguages.has(normalizeLanguage(language) ?? language ?? "");

export const applyLanguageAttributes = (language: string | null | undefined) => {
  if (typeof document === "undefined") return;

  const normalizedLanguage = normalizeLanguage(language) ?? fallbackLanguage;
  document.documentElement.lang = normalizedLanguage;
  document.documentElement.dir = isRtlLanguage(normalizedLanguage)
    ? "rtl"
    : "ltr";
};

const persistLanguage = (language: string) => {
  if (typeof window === "undefined") return;

  const normalizedLanguage = normalizeLanguage(language) ?? fallbackLanguage;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLanguage);
};

const dynamicJsonBackend: BackendModule = {
  type: "backend",
  init: () => undefined,
  read: (language, _namespace, callback) => {
    const normalizedLanguage = normalizeLanguage(language) ?? fallbackLanguage;

    languageLoaders[normalizedLanguage]()
      .then((module) => callback(null, module.default))
      .catch((error) => callback(error, null));
  },
};

const initialLanguage = detectPreferredLanguage();

if (!i18n.isInitialized) {
  void i18n
    .use(dynamicJsonBackend)
    .use(initReactI18next)
    .init({
      defaultNS: "translation",
      fallbackLng: fallbackLanguage,
      interpolation: {
        escapeValue: false,
      },
      lng: initialLanguage,
      ns: ["translation"],
      partialBundledLanguages: true,
      react: {
        useSuspense: false,
      },
      resources: {
        en: {
          translation: en,
        },
      },
      returnNull: false,
      supportedLngs: [...supportedLanguages],
    });
}

i18n.on("languageChanged", (language) => {
  persistLanguage(language);
  applyLanguageAttributes(language);
});

applyLanguageAttributes(initialLanguage);

export default i18n;
