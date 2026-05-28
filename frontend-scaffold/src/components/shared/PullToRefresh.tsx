import React, { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import Loader from "../ui/Loader";

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown> | void;
  children: React.ReactNode;
  className?: string;
  threshold?: number;
  debounceMs?: number;
}

const MOBILE_BREAKPOINT = 768;
const DEFAULT_THRESHOLD = 80;
const DEBOUNCE_MS = 2000;

const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  className = "",
  threshold = DEFAULT_THRESHOLD,
  debounceMs = DEBOUNCE_MS,
}) => {
  const reducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isHolding, setIsHolding] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isPullingRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleRefresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshRef.current < debounceMs) return;
    if (isRefreshingRef.current) return;

    isRefreshingRef.current = true;
    setIsRefreshing(true);

    try {
      await Promise.resolve(onRefresh());
    } finally {
      lastRefreshRef.current = Date.now();
      isRefreshingRef.current = false;
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh, debounceMs]);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!isMobile || isRefreshingRef.current) return;
      if (window.scrollY > 0) return;

      const touch = e.touches[0];
      if (!touch) return;

      startYRef.current = touch.clientY;
      currentYRef.current = touch.clientY;
      isPullingRef.current = true;
      setIsHolding(true);
    },
    [isMobile],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPullingRef.current || !isMobile || isRefreshingRef.current) return;

      const touch = e.touches[0];
      if (!touch) return;

      currentYRef.current = touch.clientY;
      const diff = currentYRef.current - startYRef.current;

      if (diff <= 0) {
        setPullDistance(0);
        return;
      }

      if (reducedMotion) {
        if (diff >= threshold) {
          handleRefresh();
        }
        return;
      }

      const dampening = 0.5;
      const distance = Math.min(diff * dampening, threshold * 1.5);
      pullDistanceRef.current = distance;
      setPullDistance(distance);
    },
    [isMobile, reducedMotion, threshold, handleRefresh],
  );

  const handleTouchEnd = useCallback(() => {
    if (!isPullingRef.current) return;

    isPullingRef.current = false;
    setIsHolding(false);

    if (pullDistanceRef.current >= threshold && !reducedMotion) {
      handleRefresh();
    } else {
      setPullDistance(0);
      pullDistanceRef.current = 0;
    }
  }, [threshold, reducedMotion, handleRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: true,
    });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  if (!isMobile) {
    return <>{children}</>;
  }

  const pullProgress = Math.min(pullDistance / threshold, 1);
  const showIndicator = isRefreshing || pullDistance > 10;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ touchAction: "pan-x" }}
    >
      <div
        data-essential-motion="loading"
        className={`flex items-center justify-center transition-transform duration-150 ${
          isHolding ? "" : "transition-transform duration-300 ease-out"
        }`}
        style={{
          height: isRefreshing ? 64 : Math.max(0, pullDistance),
          transform: isRefreshing ? "translateY(0)" : undefined,
        }}
      >
        {showIndicator && (
          <div
            role="status"
            aria-live="polite"
            aria-label={isRefreshing ? "Refreshing data" : "Pull to refresh"}
            className="flex items-center justify-center gap-3"
          >
            {isRefreshing ? (
              <Loader size="sm" />
            ) : (
              <div
                className="w-6 h-6 border-2 border-black rounded-full transition-transform duration-150"
                style={{
                  transform: `rotate(${pullProgress * 360}deg)`,
                  borderTopColor: "transparent",
                }}
              />
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-gray-600">
              {isRefreshing
                ? "Refreshing..."
                : pullProgress >= 1
                  ? "Release to refresh"
                  : "Pull to refresh"}
            </span>
          </div>
        )}
      </div>

      <div
        className={`transition-transform duration-150 ${
          isHolding ? "" : "transition-transform duration-300 ease-out"
        }`}
        style={{
          transform:
            isRefreshing || pullDistance > 0
              ? `translateY(${isRefreshing ? 64 : Math.max(0, pullDistance)}px)`
              : "translateY(0)",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
