import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import * as Sentry from "@sentry/react";

/**
 * Hook to track route changes and set Sentry breadcrumbs and tags.
 * Automatically captures navigation events and associates them with error reports.
 *
 * Usage: Call this hook in your main App component or a layout component.
 * It will track all route changes and set context for error correlation.
 *
 * Example:
 * ```
 * function App() {
 *   useSentryRouteTracking();
 *   // ... rest of app
 * }
 * ```
 */
export function useSentryRouteTracking(): void {
  const location = useLocation();

  useEffect(() => {
    // Update Sentry transaction name based on route
    const transaction = Sentry.getActiveTransaction();
    if (transaction) {
      transaction.setName(location.pathname);
    }

    // Set the route as a tag for error filtering and analysis
    Sentry.setTag("route", location.pathname);
    Sentry.setContext("navigation", {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    });

    // Add breadcrumb for route navigation
    Sentry.captureMessage(`Navigated to ${location.pathname}`, {
      level: "debug",
      tags: {
        type: "navigation",
        route: location.pathname,
      },
    });
  }, [location.pathname, location.search, location.hash]);
}
