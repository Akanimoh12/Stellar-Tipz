import React, { useEffect } from 'react';
import { useWalletResilience } from '../../hooks/useWalletResilience';
import { useOptimisticStore } from '../../store/optimisticUpdatesStore';

/**
 * Root layout component that initializes core functionality.
 * Wraps your entire app with wallet resilience and optimistic update handlers.
 */
export const AppRoot: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Enable wallet state monitoring
  useWalletResilience();

  // Cleanup optimistic updates periodically
  const cleanup = useOptimisticStore((state) => state.cleanup);
  useEffect(() => {
    const interval = setInterval(cleanup, 60 * 1000); // Every minute
    return () => clearInterval(interval);
  }, [cleanup]);

  return <>{children}</>;
};
