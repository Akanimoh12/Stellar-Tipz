import React, { Suspense } from 'react';
import PageTransition from '@/components/shared/PageTransition';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import PageLoader from '@/components/shared/PageLoader';
import ErrorBoundary from '@/components/shared/ErrorBoundary';

/**
 * Wraps a route element with its own isolated ErrorBoundary, Suspense fallback,
 * and PageTransition. Keying the ErrorBoundary by `routeName` ensures a crash
 * on one route cannot blank the whole app and automatically recovers when the
 * user navigates to another route.
 */
export const wrap = (
  element: React.ReactElement,
  skeleton?: React.ReactNode,
  routeName = 'route',
) => (
  <ErrorBoundary key={routeName} level="feature" name={routeName}>
    <Suspense fallback={skeleton ?? <PageLoader />}>
      <PageTransition>{element}</PageTransition>
    </Suspense>
  </ErrorBoundary>
);

/**
 * Wraps a component with ProtectedRoute and the default wrap (per-route error
 * boundary + transitions + loading).
 */
export const protect = (
  element: React.ReactElement,
  skeleton?: React.ReactNode,
  routeName = 'route',
) => (
  <ProtectedRoute>{wrap(element, skeleton, routeName)}</ProtectedRoute>
);
