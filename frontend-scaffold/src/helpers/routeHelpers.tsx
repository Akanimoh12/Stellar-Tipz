import React, { Suspense } from 'react';
import PageTransition from '@/components/shared/PageTransition';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import PageLoader from '@/components/shared/PageLoader';
import ErrorBoundary from '@/components/shared/ErrorBoundary';

/**
 * Wraps a component with ErrorBoundary, Suspense (PageLoader) and PageTransition.
 * Issue #733: All routes now have error boundaries
 */
export const wrap = (element: React.ReactElement) => (
  <ErrorBoundary>
    <Suspense fallback={<PageLoader />}>
      <PageTransition>{element}</PageTransition>
    </Suspense>
  </ErrorBoundary>
);

/**
 * Wraps a component with ProtectedRoute and the default wrap (error boundary + transitions + loading).
 */
export const protect = (element: React.ReactElement) => (
  <ProtectedRoute>{wrap(element)}</ProtectedRoute>
);
