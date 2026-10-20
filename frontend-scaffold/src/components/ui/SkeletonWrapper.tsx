import React from 'react';
import { useDeferredLoading } from '@/hooks/useDeferredLoading';

export interface SkeletonWrapperProps {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  delayMs?: number;
}

const SkeletonWrapper: React.FC<SkeletonWrapperProps> = ({
  loading,
  skeleton,
  children,
  delayMs = 200,
}) => {
  const showSkeleton = useDeferredLoading(loading, delayMs);

  if (showSkeleton) {
    return (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading</span>
        {skeleton}
      </div>
    );
  }

  // During delay, render children invisibly to reserve layout space (no CLS)
  if (loading) {
    return (
      <div style={{ visibility: 'hidden' }} aria-hidden="true">
        {children}
      </div>
    );
  }

  return <>{children}</>;
};

export default SkeletonWrapper;
