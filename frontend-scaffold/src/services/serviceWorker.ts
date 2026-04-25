/**
 * Service worker registration, update management, and offline tip queue.
 *
 * Usage:
 *   import * as SW from '@/services/serviceWorker';
 *   SW.register();                          // call once at app boot
 *   SW.onUpdateAvailable(() => showBanner); // subscribe to update events
 *   SW.skipWaiting();                       // called when user confirms update
 *   await SW.queueOfflineTip(data);         // queue a tip while offline
 */

const SW_URL = '/sw.js';
const SYNC_TAG = 'tipz-tip-sync';
const DB_NAME = 'tipz-sync';
const STORE_NAME = 'pendingTips';

export interface PendingTip {
  id?: number;
  data: Record<string, unknown>;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Update notification
// ---------------------------------------------------------------------------

type UpdateCallback = () => void;
const updateListeners: UpdateCallback[] = [];

/**
 * Subscribe to "a new service worker version is waiting to activate".
 * Returns an unsubscribe function.
 */
export function onUpdateAvailable(cb: UpdateCallback): () => void {
  updateListeners.push(cb);
  return () => {
    const idx = updateListeners.indexOf(cb);
    if (idx !== -1) updateListeners.splice(idx, 1);
  };
}

function notifyUpdateAvailable(): void {
  updateListeners.forEach((cb) => cb());
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register the service worker and wire up update detection. */
export async function register(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register(SW_URL);

    // Detect future updates.
    registration.addEventListener('updatefound', () => {
      const incoming = registration.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        if (
          incoming.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          notifyUpdateAvailable();
        }
      });
    });

    // A worker was already waiting before this page load.
    if (registration.waiting && navigator.serviceWorker.controller) {
      notifyUpdateAvailable();
    }

    // The SW itself can also post UPDATE_AVAILABLE (e.g. on install).
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data === 'UPDATE_AVAILABLE') {
        notifyUpdateAvailable();
      }
    });

    // Proactively check for updates.
    registration.update().catch(() => null);
  } catch (err) {
    console.warn('[SW] Registration failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Update activation
// ---------------------------------------------------------------------------

/**
 * Tell the waiting service worker to skip waiting and take control.
 * Call this when the user confirms the "update available" prompt.
 * The page will reload once the new SW claims clients.
 */
export async function skipWaiting(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration?.waiting) {
    registration.waiting.postMessage('SKIP_WAITING');
    // Reload once the new SW has claimed this client.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }
}

// ---------------------------------------------------------------------------
// Offline tip queue (IndexedDB)
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
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

/**
 * Persist a tip operation to IndexedDB so the SW can replay it once online.
 * Also registers a Background Sync tag when the API is available.
 */
export async function queueOfflineTip(
  data: Record<string, unknown>,
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).add({
      data,
      createdAt: Date.now(),
    } as PendingTip);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // Request Background Sync if the browser supports it.
  if ('serviceWorker' in navigator) {
    const swRegistration = await navigator.serviceWorker.ready;
    if ('sync' in swRegistration) {
      await (
        swRegistration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> };
        }
      ).sync.register(SYNC_TAG);
    }
  }
}

/** Returns the number of tips currently waiting in the offline queue. */
export async function getPendingTipCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}
