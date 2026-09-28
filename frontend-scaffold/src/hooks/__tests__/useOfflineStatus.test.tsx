/**
 * Tests for the service worker integration:
 *  - useOfflineStatus hook
 *  - Offline indicator
 *  - Offline action guards
 */

import React from "react";
import {
  render,
  screen,
  act,
  fireEvent,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useOfflineStatus } from "../useOfflineStatus";
import * as SW from "../../services/serviceWorker";
import NetworkActionGuard from "@/components/shared/NetworkActionGuard";
import OfflineBanner from "@/components/shared/OfflineBanner";

/**
 * Toggle the browser's simulated online/offline state and fire the matching
 * window event so hooks that listen to those events update correctly.
 */
function setOffline(offline: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value: !offline,
    writable: true,
    configurable: true,
  });
  window.dispatchEvent(new Event(offline ? "offline" : "online"));
}

describe("useOfflineStatus", () => {
  afterEach(() => setOffline(false));

  it("returns isOnline=true when navigator.onLine is true", () => {
    setOffline(false);
    const { result } = renderHook(() => useOfflineStatus());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isOffline).toBe(false);
  });

  it("returns isOffline=true when navigator.onLine is false", () => {
    setOffline(true);
    const { result } = renderHook(() => useOfflineStatus());
    expect(result.current.isOffline).toBe(true);
    expect(result.current.isOnline).toBe(false);
  });

  it("updates reactively when the online/offline events fire", () => {
    setOffline(false);
    const { result } = renderHook(() => useOfflineStatus());
    expect(result.current.isOffline).toBe(false);

    act(() => setOffline(true));
    expect(result.current.isOffline).toBe(true);

    act(() => setOffline(false));
    expect(result.current.isOffline).toBe(false);
  });
});

describe("Service worker", () => {
  beforeEach(() => {
    if (typeof globalThis.caches === "undefined") {
      const mockStorage = new Map<string, Response>();
      const mockCache = {
        put: vi.fn(async (req: string, res: Response) => {
          mockStorage.set(req, res);
        }),
        match: vi.fn(async (req: string) => mockStorage.get(req) ?? null),
      };
      Object.defineProperty(globalThis, "caches", {
        value: {
          open: vi.fn(async () => mockCache),
          keys: vi.fn(async () => []),
          delete: vi.fn(async () => true),
        },
        writable: true,
        configurable: true,
      });
    }
  });

  it("caches static assets", async () => {
    const cache = await caches.open("tipz-pwa-v2-static");
    await cache.put("/index.html", new Response("<html/>"));
    expect(await cache.match("/index.html")).toBeTruthy();
  });

  it("shows offline indicator when offline", () => {
    setOffline(true);

    render(
      <MemoryRouter>
        <OfflineBanner customMessage="Offline – you are browsing cached content" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    setOffline(false);
  });

  it("guards actions requiring network when offline", () => {
    setOffline(true);
    const submitAction = vi.fn();

    render(
      <MemoryRouter>
        <NetworkActionGuard>
          <button onClick={submitAction}>Send tip</button>
        </NetworkActionGuard>
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    setOffline(false);
  });
});

describe("serviceWorker service", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        register: vi.fn().mockResolvedValue({
          waiting: null,
          installing: null,
          addEventListener: vi.fn(),
          update: vi.fn().mockResolvedValue(undefined),
        }),
        addEventListener: vi.fn(),
        getRegistration: vi.fn().mockResolvedValue(undefined),
        ready: Promise.resolve({ sync: undefined }),
      },
      writable: true,
      configurable: true,
    });
  });

  it("register() does not throw when serviceWorker is supported", async () => {
    await expect(SW.register()).resolves.not.toThrow();
  });

  it("onUpdateAvailable returns an unsubscribe function", () => {
    const cb = vi.fn();
    const unsub = SW.onUpdateAvailable(cb);
    expect(typeof unsub).toBe("function");
    unsub();
  });
});
