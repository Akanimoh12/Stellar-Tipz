import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { I18nProvider, useI18n } from "./i18n";
import { logger } from "./services/logger";
import { validateEnv } from "./helpers/env";
import { initSentry } from "./services/sentry";
import ErrorBoundary from "./components/shared/ErrorBoundary";

import "./index.scss";

try {
  validateEnv();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error("startup", "Environment validation failed", { error: msg });
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `<pre style="color:red;font-family:monospace;padding:1rem">Environment error: ${msg}\n\nSet the required variables in your .env file and restart.</pre>`;
  }
  throw err;
}

initSentry();

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function InstallPromptBanner() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: Event) => {
      // Some browsers require calling preventDefault to show custom UI
      e.preventDefault?.();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="false"
      className="fixed bottom-safe left-1/2 z-[9999] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 border-4 border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-600">
            {t("install.title")}
          </p>
          <p className="text-sm font-bold text-gray-800">
            {t("install.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="border-2 border-black bg-black px-4 py-2 text-xs font-black uppercase tracking-wide text-white"
            onClick={async () => {
              if (!deferredPrompt) return;
              try {
                await deferredPrompt.prompt();
                await deferredPrompt.userChoice;
              } catch (err) {
                logger.warn(
                  'index',
                  'Install prompt dismissed or failed',
                  undefined,
                  err instanceof Error ? err : new Error(String(err)),
                );
              }
              setVisible(false);
              setDeferredPrompt(null);
            }}
          >
            {t("install.install")}
          </button>
          <button
            type="button"
            className="border-2 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-wide"
            onClick={() => setVisible(false)}
          >
            {t("install.notNow")}
          </button>
        </div>
      </div>
    </div>
  );
}

function OfflineScreen() {
  const { t } = useI18n();

  return (
    <div
      className="min-h-screen bg-off-white p-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-atomic="true"
    >
      <div className="mx-auto max-w-2xl border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <h1 className="text-3xl font-black uppercase">{t("offline.title")}</h1>
        <p className="mt-3 text-sm font-bold text-gray-700">
          {t("offline.description")}
        </p>
      </div>
    </div>
  );
}

function Root() {
  const [online, setOnline] = React.useState<boolean>(navigator.onLine);

  React.useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!online) return <OfflineScreen />;

  return (
    <>
      <App />
      <InstallPromptBanner />
    </>
  );
}

import { register as registerSW } from "./services/serviceWorker";

// Register the service worker (public/sw.js). Update detection and
// "update available" UI are handled inside App via onUpdateAvailable().
registerSW();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <ErrorBoundary level="root" name="root">
        <Root />
      </ErrorBoundary>
    </I18nProvider>
  </React.StrictMode>,
);
