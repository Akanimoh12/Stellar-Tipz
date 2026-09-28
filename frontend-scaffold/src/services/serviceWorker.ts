/**
 * #1311 & #1312 — Service worker registration, update management, and offline support.
 *
 * ## Architectural Note on Offline Transactions (#1311):
 * Blockchain transactions (tips, claimable balances, contract invocations) are
 * **explicitly NOT queued for offline signing or deferred broadcasting**.
 *
 * Rationale:
 * 1. Sequence Number Desynchronization: Stellar transactions require strictly monotonic
 *    account sequence numbers. Offline transactions signed out-of-order will fail on-chain
 *    with `txBAD_SEQ`.
 * 2. Stale Network Fees & Surge Pricing: Network base fees change dynamically across ledgers.
 *    Queued transactions with outdated fee bids fail or stall indefinitely.
 * 3. Contract & Creator State Invalidation: Between offline creation and online broadcast,
 *    a creator may change their receiving address, alter goals, or deregister.
 * 4. User Intent & Double-Spend Risks: Delayed auto-broadcast may surprise the user hours
 *    later or double-submit when connectivity is intermittently restored.
 *
 * Therefore, read-only views serve cached data with a staleness indicator, while
 * state-modifying actions requiring network are disabled with an explicit explanation.
 */

import { logger } from './logger';

const SW_URL = '/sw.js';
export const CURRENT_SW_VERSION = '2.0.0';

export interface UpdateInfo {
  isCritical?: boolean;
  version?: string;
  minRequiredVersion?: string;
}

// ---------------------------------------------------------------------------
// Update notification & Version Gate (#1312)
// ---------------------------------------------------------------------------

export type UpdateCallback = (info: UpdateInfo) => void;
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

export function notifyUpdateAvailable(info: UpdateInfo = {}): void {
  updateListeners.forEach((cb) => cb(info));
}

/**
 * Compares two semantic version strings (e.g. "1.2.0" vs "2.0.0").
 * Returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2.
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = v2.split('.').map((p) => parseInt(p, 10) || 0);

  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Checks whether the current client version satisfies the minimum version gate.
 * If currentVersion < minRequiredVersion, forces immediate reload/update.
 */
export function isVersionGateTriggered(
  currentVersion: string,
  minRequiredVersion?: string,
): boolean {
  if (!minRequiredVersion) return false;
  return compareVersions(currentVersion, minRequiredVersion) < 0;
}

// ---------------------------------------------------------------------------
// Registration & Proactive Update Checks (#1312)
// ---------------------------------------------------------------------------

/** Register the service worker and wire up update detection. */
export async function register(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return undefined;
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_URL);

    // Detect incoming updates
    registration.addEventListener('updatefound', () => {
      const incoming = registration.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        if (
          incoming.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          notifyUpdateAvailable({ version: CURRENT_SW_VERSION });
        }
      });
    });

    // A worker was already waiting before this page load
    if (registration.waiting && navigator.serviceWorker.controller) {
      notifyUpdateAvailable({ version: CURRENT_SW_VERSION });
    }

    // SW message listener for update events and version gates
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'UPDATE_AVAILABLE' || event.data === 'UPDATE_AVAILABLE') {
        const info: UpdateInfo = typeof event.data === 'object' ? event.data : {};
        notifyUpdateAvailable(info);

        if (info.minRequiredVersion && isVersionGateTriggered(CURRENT_SW_VERSION, info.minRequiredVersion)) {
          logger.warn('services/serviceWorker', 'Critical version gate triggered, applying update immediately', undefined);
          void skipWaiting();
        }
      }
    });

    // Proactively check for updates
    try {
      await registration.update();
    } catch (err) {
      logger.warn(
        'services/serviceWorker',
        'registration.update() check failed',
        undefined,
        err instanceof Error ? err : new Error(String(err)),
      );
    }

    return registration;
  } catch (err) {
    logger.warn('services/serviceWorker', 'SW registration failed', undefined, err instanceof Error ? err : new Error(String(err)));
    return undefined;
  }
}

/**
 * Manually trigger an update check (e.g. on navigation or app focus).
 */
export async function checkForUpdate(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update();
      return !!registration.waiting;
    }
  } catch (err) {
    logger.warn('services/serviceWorker', 'checkForUpdate error', undefined, err instanceof Error ? err : new Error(String(err)));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Update Activation (#1312)
// ---------------------------------------------------------------------------

/**
 * Instructs the waiting service worker to skip waiting, claim clients,
 * and refreshes the page to prevent mismatched chunk loading.
 */
export async function skipWaiting(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    registration.waiting.postMessage('SKIP_WAITING');

    // Reload window as soon as new service worker claims control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  } else {
    // If no waiting worker, reload directly to ensure fresh assets
    window.location.reload();
  }
}
