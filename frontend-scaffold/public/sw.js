/**
 * Stellar Tipz – Service Worker
 *
 * Responsibilities:
 *  • Pre-cache static assets on install (cache name: tipz-static-v1)
 *  • Cache API responses for offline viewing (cache name: tipz-api-v1)
 *  • Serve cached content when offline
 *  • Queue tip operations for background sync via IndexedDB
 *  • Notify connected clients when a new version is waiting
 *  • Skip waiting when commanded by a client (user confirms update)
 */

const STATIC_CACHE = 'tipz-static-v1';
const API_CACHE = 'tipz-api-v1';
const SYNC_TAG = 'tipz-tip-sync';
const DB_NAME = 'tipz-sync';
const STORE_NAME = 'pendingTips';

/** Static assets to pre-cache on install. */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/pwa-icon.svg',
  '/pwa-maskable.svg',
];

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  // Notify any open windows that a new version is available.
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => client.postMessage('UPDATE_AVAILABLE'));
  });

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  // Do NOT skipWaiting automatically; wait for user confirmation via message.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// Fetch strategy
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // API responses: network-first, cache on success, fallback to cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches
              .open(API_CACHE)
              .then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ??
              new Response(JSON.stringify({ error: 'Offline' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }),
          ),
        ),
    );
    return;
  }

  // Static assets & navigation: cache-first, network fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            caches
              .open(STATIC_CACHE)
              .then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches
            .open(STATIC_CACHE)
            .then((c) => c.match('/offline.html'))
            .then(
              (offline) =>
                offline ??
                new Response('Offline', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain' },
                }),
            ),
        );
    }),
  );
});

// ---------------------------------------------------------------------------
// Background sync – flush queued tip operations
// ---------------------------------------------------------------------------

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushTipQueue());
  }
});

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, {
        keyPath: 'id',
        autoIncrement: true,
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function flushTipQueue() {
  const db = await openDB();
  const pending = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const tip of pending) {
    try {
      const response = await fetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tip.data),
      });

      if (response.ok) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const req = tx.objectStore(STORE_NAME).delete(tip.id);
          req.onsuccess = () => resolve(undefined);
          req.onerror = () => reject(req.error);
        });
      }
    } catch {
      // Will retry on next sync event.
    }
  }
}

// ---------------------------------------------------------------------------
// Client messaging
// ---------------------------------------------------------------------------

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
