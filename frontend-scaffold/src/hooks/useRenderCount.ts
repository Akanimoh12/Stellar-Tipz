import { useRef } from "react";

declare global {
  interface Window {
    __TIPZ_RENDER_COUNTS__?: Record<string, number>;
  }
}

export function useRenderCount(componentName: string, instanceKey?: string): number {
  const renderCount = useRef(0);

  if (import.meta.env.DEV) {
    renderCount.current += 1;

    if (typeof window !== "undefined") {
      const key = instanceKey ? `${componentName}:${instanceKey}` : componentName;
      // eslint-disable-next-line react-hooks/immutability
      window.__TIPZ_RENDER_COUNTS__ = window.__TIPZ_RENDER_COUNTS__ ?? {};
      // eslint-disable-next-line react-hooks/immutability
      window.__TIPZ_RENDER_COUNTS__[key] =
        (window.__TIPZ_RENDER_COUNTS__[key] ?? 0) + 1;
    }
  }

  return renderCount.current;
}
