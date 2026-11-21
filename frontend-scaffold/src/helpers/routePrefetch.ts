/**
 * Route-level code splitting + prefetch registry (#1337).
 *
 * Every lazily loaded route registers its dynamic import here so that the
 * `React.lazy` loader and hover/focus prefetching share one module promise:
 * a prefetched chunk is never downloaded twice, and a route whose chunk was
 * prefetched renders without hitting its Suspense fallback.
 */
import type { ComponentType } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteModule = { default: ComponentType<any> };
export type RouteLoader = () => Promise<RouteModule>;

const inflight = new Map<RouteLoader, Promise<RouteModule>>();

/**
 * Wraps a dynamic import so repeated calls (lazy render, prefetch) reuse the
 * same promise. A failed load is evicted so the next attempt can retry.
 */
export function createRouteLoader(importer: RouteLoader): RouteLoader {
  const loader: RouteLoader = () => {
    let promise = inflight.get(loader);
    if (!promise) {
      promise = importer().catch((err) => {
        inflight.delete(loader);
        throw err;
      });
      inflight.set(loader, promise);
    }
    return promise;
  };
  return loader;
}

interface RouteMatcher {
  test: (pathname: string) => boolean;
  load: RouteLoader;
}

const matchers: RouteMatcher[] = [];

/** Registers a loader for a path pattern (react-router style, `:param` + `@:param`). */
export function registerRoutePrefetch(pattern: string, load: RouteLoader) {
  const source = pattern
    .split("/")
    .map((segment) =>
      segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[A-Za-z0-9_]+/g, "[^/]+"),
    )
    .join("/");
  const regex = new RegExp(`^${source}/?$`);
  matchers.push({ test: (pathname) => regex.test(pathname), load });
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

const SLOW_CONNECTIONS = new Set(["slow-2g", "2g"]);

/**
 * Prefetching is skipped when the user opted into data saving or is on a slow
 * connection — there the speculative bytes cost more than the latency saved.
 */
export function canPrefetch(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike })
    .connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  if (connection.effectiveType && SLOW_CONNECTIONS.has(connection.effectiveType)) {
    return false;
  }
  return true;
}

function toPathname(to: string): string {
  const [path] = to.split(/[?#]/);
  return path || "/";
}

/**
 * Starts downloading the chunk for `to` if a route matches and the network
 * allows it. Safe to call repeatedly; returns the load promise (or null).
 */
export function prefetchRoute(to: string): Promise<RouteModule> | null {
  if (!canPrefetch()) return null;
  const pathname = toPathname(to);
  const match = matchers.find((m) => m.test(pathname));
  if (!match) return null;
  const promise = match.load();
  // Prefetch is best-effort; the real navigation surfaces any load error.
  promise.catch(() => undefined);
  return promise;
}

/** Test-only: clears registered matchers and cached promises. */
export function __resetRoutePrefetch() {
  matchers.length = 0;
  inflight.clear();
}
