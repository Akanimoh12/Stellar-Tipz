/// <reference lib="webworker" />

export {};

declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = "tipz-pwa-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;

const STATIC_ASSETS: string[] = [
  "/",
  "/leaderboard",
  "/offline.html",
  "/manifest.json",
  "/pwa-icon.svg",
  "/pwa-maskable.svg",
];

async function preCache() {
  const cache = await caches.open(STATIC_CACHE);
  await cache.addAll(STATIC_ASSETS);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await preCache();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request: Request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirstForPages(request: Request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.open(STATIC_CACHE).then((c) => c.match("/offline.html"));
    return offline ?? new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Navigation requests: cache landing + leaderboard for offline viewing, fallback to offline.html
  if (request.mode === "navigate") {
    event.respondWith(networkFirstForPages(request));
    return;
  }

  // Static assets: cache-first
  const dest = request.destination;
  if (dest === "script" || dest === "style" || dest === "image" || dest === "font") {
    event.respondWith(cacheFirst(request));
  }
});

// Basic push notification support (payload optional).
self.addEventListener("push", (event) => {
  const data = event.data?.json?.() as { title?: string; body?: string; url?: string } | undefined;
  const title = data?.title ?? "New tip received";
  const body = data?.body ?? "Open Stellar Tipz to view your latest tip.";
  const targetUrl = data?.url ?? "/dashboard";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa-icon.svg",
      badge: "/pwa-icon.svg",
      data: { url: targetUrl },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = allClients.find((c) => "focus" in c) as WindowClient | undefined;
      if (existing) {
        await existing.focus();
        await existing.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

