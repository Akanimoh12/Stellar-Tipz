import React from "react";
import { BrowserRouter, useRoutes } from "react-router-dom";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ScrollToTop from "@/components/shared/ScrollToTop";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ToastContainer from "@/components/shared/ToastContainer";
import KeyboardShortcutsProvider from "@/components/shared/KeyboardShortcutsProvider";
import { routes } from "@/routes";
import { useI18n } from "@/i18n";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { onUpdateAvailable, skipWaiting } from "@/services/serviceWorker";

const AppRoutes: React.FC = () => {
  const routeElements = useRoutes(routes);
  const { t } = useI18n();
  const { isOffline } = useOfflineStatus();
  const [updateReady, setUpdateReady] = React.useState(false);

  React.useEffect(() => {
    const unsub = onUpdateAvailable(() => setUpdateReady(true));
    return unsub;
  }, []);

  return (
    <>
      <ScrollToTop />
      <KeyboardShortcutsProvider />
      <ErrorBoundary>
        {isOffline && (
          <div
            role="status"
            aria-live="polite"
            className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b-4 border-black bg-yellow-300 px-4 py-2 text-sm font-black uppercase tracking-wide"
          >
            <span>Offline – you are browsing cached content</span>
          </div>
        )}
        {updateReady && (
          <div
            role="status"
            aria-live="polite"
            className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b-4 border-black bg-blue-200 px-4 py-2 text-sm font-black uppercase tracking-wide"
          >
            <span>Update available</span>
            <button
              type="button"
              className="border-2 border-black bg-black px-3 py-1 text-xs font-black uppercase text-white"
              onClick={() => void skipWaiting()}
            >
              Reload now
            </button>
          </div>
        )}
        <div className="min-h-screen flex flex-col bg-white dark:bg-black">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:bg-black focus:text-white focus:px-4 focus:py-2 focus:font-black focus:outline-none"
          >
            {t("app.skipToMain")}
          </a>
          <Header />
          <div className="flex-1">{routeElements}</div>
          <Footer />
        </div>
      </ErrorBoundary>
      <ToastContainer />
    </>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

export default App;
