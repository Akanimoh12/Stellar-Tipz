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
const DB_NAME = 'tipz-sync';
const STORE_NAME = 'pendingTips';

export type PendingTipStatus = "queued" | "failed";

export interface PendingTip {
  id?: number;
  data: Record<string, unknown>;
  createdAt: number;
  status?: PendingTipStatus;
  error?: string;
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
import { logger } from "./logger";

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
    try {
      await registration.update();
    } catch (err) {
      logger.warn(
        'services/serviceWorker',
        'registration.update() failed',
        undefined,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  } catch (err) {
    logger.warn('services/serviceWorker', 'SW registration failed', undefined, err instanceof Error ? err : new Error(String(err)));
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
        keyPath: "id",
        autoIncrement: true,
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persist a tip locally. Sending it still requires an explicit wallet action.
 */
export async function queueOfflineTip(
  data: Record<string, unknown>,
): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const request = tx.objectStore(STORE_NAME).add({
      data,
      createdAt: Date.now(),
      status: "queued",
    } satisfies PendingTip);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Could not save offline tip"));
  });
}

/** Return saved tips, including records created by the previous queue. */
export async function getPendingTips(): Promise<PendingTip[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => {
      const records = request.result as PendingTip[];
      resolve(
        records.map((tip) => ({
          ...tip,
          status: tip.status ?? "queued",
        })),
      );
    };
    request.onerror = () => reject(request.error);
  });
}

/** Update a queued tip after an explicit retry attempt. */
export async function updatePendingTip(
  id: number,
  updates: Partial<Pick<PendingTip, "status" | "error">>,
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      if (!request.result) {
        reject(new Error("Queued tip was not found"));
        return;
      }

      store.put({ ...request.result, ...updates });
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Could not update queued tip"));
  });
}

/** Remove a tip after its wallet-approved transaction succeeds. */
export async function removePendingTip(id: number): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Could not remove queued tip"));
  });
}

/** Returns the number of tips currently waiting in the offline queue. */
export async function getPendingTipCount(): Promise<number> {
  const tips = await getPendingTips();
  return tips.length;
}
