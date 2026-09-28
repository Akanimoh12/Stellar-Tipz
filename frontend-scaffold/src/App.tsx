import React, { Suspense } from "react";
import { BrowserRouter, useRoutes } from "react-router-dom";
import { MotionConfig } from "framer-motion";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ScrollToTop from "@/components/shared/ScrollToTop";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ToastContainer from "@/components/shared/ToastContainer";
import KeyboardShortcutsProvider from "@/components/shared/KeyboardShortcutsProvider";
import PageTransition from "@/components/shared/PageTransition";
import PageAnnouncement from "@/components/shared/PageAnnouncement";
import { RpcHealthBanner } from "@/components/shared/RpcHealthBanner";
import { routes } from "@/routes";
import { useI18n } from "@/i18n";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useAnalytics } from "@/hooks/useAnalytics";
import OnboardingTour from "@/features/onboarding/OnboardingTour";

import { onUpdateAvailable, skipWaiting } from "@/services/serviceWorker";

const PageFallback: React.FC = () => (
  <PageFallbackContent />
);

const PageFallbackContent: React.FC = () => {
  const { t } = useI18n();

  return (
    <div
      className="flex items-center justify-center min-h-[400px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-center">
        <div className="mb-4 h-8 w-8 border-4 border-gray-300 border-t-black rounded-full animate-spin mx-auto"></div>
        <p className="text-gray-600">{t("app.loadingPage")}</p>
      </div>
    </div>
  );
};

const AppRoutes: React.FC = () => {
  const routeElements = useRoutes(routes);
  const { t } = useI18n();
  const { isOffline } = useOfflineStatus();
  const reduceMotion = useReducedMotion();
  useAnalytics();
  const [updateReady, setUpdateReady] = React.useState(false);

  React.useEffect(() => {
    const unsub = onUpdateAvailable(() => setUpdateReady(true));
    return unsub;
  }, []);

  const { isTourOpen, completeTour, skipTour } = useOnboarding();

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>
      <ScrollToTop />
      <PageAnnouncement />
      <KeyboardShortcutsProvider />
      <ErrorBoundary>
        <RpcHealthBanner />
        {isOffline && (
          <div
            role="status"
            aria-live="polite"
            className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b-4 border-black bg-yellow-300 px-4 py-2 text-sm font-black uppercase tracking-wide"
          >
            <span>{t("app.offlineBanner")}</span>
          </div>
        )}
        {updateReady && (
          <div
            role="status"
            aria-live="polite"
            className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b-4 border-black bg-blue-200 px-4 py-2 text-sm font-black uppercase tracking-wide"
          >
            <span>{t("app.updateAvailable")}</span>
            <button
              type="button"
              className="border-2 border-black bg-black px-3 py-1 text-xs font-black uppercase text-white"
              onClick={() => void skipWaiting()}
            >
              {t("app.reloadNow")}
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
          <div className="flex-1">
            <PageTransition animationType="fade">
              <Suspense fallback={<PageFallback />}>{routeElements}</Suspense>
            </PageTransition>
          </div>
          <Footer />
        </div>
      </ErrorBoundary>
      <ToastContainer />
      <OnboardingTour open={isTourOpen} onComplete={completeTour} onSkip={skipTour} />
    </MotionConfig>
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
