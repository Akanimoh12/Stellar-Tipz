import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Loader from '@/components/ui/Loader';

/**
 * Enhanced centered loader for lazy-loaded pages.
 * Includes timeout protection and failure recovery mechanisms.
 */
const PageLoader: React.FC = () => {
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 10-second timeout to prevent infinite loading state
    const timer = setTimeout(() => {
      setIsTimedOut(true);
    }, 10000);

    // Listener for chunk load failures (common during redeployments)
    const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const message = 'message' in event ? event.message : (event as PromiseRejectionEvent).reason?.message;
      if (message?.includes('ChunkLoadError') || message?.includes('Loading chunk')) {
        setError('A new version of the app is available. Please reload.');
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);

    // Mandatory cleanup to prevent memory leaks and unexpected state updates
    return () => {
      clearTimeout(timer);
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, []);

  const handleRetry = () => {
    window.location.reload();
  };

  if (isTimedOut || error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="max-w-md space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-red-600">
              {error ? 'Update Available' : 'Loading Error'}
            </h2>
            <p className="text-gray-600">
              {error || 'This is taking longer than expected. You can try reloading or return home.'}
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleRetry}
              className="w-full sm:w-auto px-6 py-2 bg-black text-white font-bold rounded-full hover:bg-gray-800 transition-colors"
            >
              Retry
            </button>
            <Link
              to="/"
              className="w-full sm:w-auto px-6 py-2 border-2 border-black text-black font-bold rounded-full hover:bg-gray-100 transition-colors"
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center py-20" role="status">
      <Loader text="Loading..." />
    </div>
  );
};

export default PageLoader;
