import { useState, useEffect, useRef } from 'react';

/**
 * Delays showing loading UI to avoid flashing skeletons on fast loads.
 *
 * Returns `false` initially even if `isLoading` is `true`.
 * After `delayMs` elapses while still loading, returns `true`.
 * Immediately returns `false` when loading completes.
 */
export function useDeferredLoading(
  isLoading: boolean,
  delayMs: number = 200,
): boolean {
  const [showLoading, setShowLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      timerRef.current = setTimeout(() => {
        setShowLoading(true);
      }, delayMs);
    } else {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShowLoading(false);
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLoading, delayMs]);

  return showLoading;
}
