import { logger } from "./logger";
import { useWalletStore } from "../store/walletStore";
import { useNotificationStore } from "../store/notificationStore";
import { useProfileStore } from "../store/profileStore";
import { setTokens, clearTokens } from "./auth/tokenManager";
import { clearClientStorageOnLogout } from "./secureStorage";

export type CrossTabEvent =
  | { type: "LOGOUT" }
  | { type: "WALLET_DISCONNECT" }
  | {
      type: "WALLET_CONNECT";
      payload: { publicKey: string; walletType?: string };
    }
  | {
      type: "AUTH_TOKENS_UPDATED";
      payload: { accessToken: string; refreshToken: string };
    }
  | { type: "NOTIFICATION_READ"; payload: { id: string } }
  | { type: "NOTIFICATION_ALL_READ" };

const CHANNEL_NAME = "stellar_tipz_cross_tab";

let channel: BroadcastChannel | null = null;
let isBroadcasting = false;
let isInitialized = false;

function getBroadcastChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch (err) {
      logger.warn(
        "services/crossTabSync",
        "BroadcastChannel creation failed, falling back to storage events",
        undefined,
        err instanceof Error ? err : new Error(String(err))
      );
      channel = null;
    }
  }
  return channel;
}

/**
 * Broadcast an event to all other open tabs.
 */
export function broadcastCrossTabEvent(event: CrossTabEvent): void {
  if (isBroadcasting) return;

  const bc = getBroadcastChannel();
  if (bc) {
    try {
      bc.postMessage(event);
    } catch (err) {
      logger.warn(
        "services/crossTabSync",
        "Failed to post cross-tab message via BroadcastChannel",
        undefined,
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }
}

/**
 * Handle incoming cross-tab messages from BroadcastChannel or storage events.
 */
export function handleCrossTabEvent(event: CrossTabEvent): void {
  isBroadcasting = true;
  try {
    switch (event.type) {
      case "LOGOUT":
      case "WALLET_DISCONNECT": {
        // Disconnect wallet, clear profile, wipe auth tokens and sensitive storage
        useWalletStore.getState().disconnect();
        clearTokens();
        useProfileStore.getState().clearProfile();
        clearClientStorageOnLogout();
        break;
      }

      case "WALLET_CONNECT": {
        const { publicKey, walletType } = event.payload;
        if (publicKey) {
          useWalletStore.getState().connect(publicKey, walletType);
        }
        break;
      }

      case "AUTH_TOKENS_UPDATED": {
        if (event.payload.accessToken && event.payload.refreshToken) {
          setTokens(event.payload);
        }
        break;
      }

      case "NOTIFICATION_READ": {
        if (event.payload.id) {
          useNotificationStore.getState().markAsRead(event.payload.id);
        }
        break;
      }

      case "NOTIFICATION_ALL_READ": {
        useNotificationStore.getState().markAllAsRead();
        break;
      }
    }
  } catch (err) {
    logger.error(
      "services/crossTabSync",
      "Error processing cross-tab event",
      undefined,
      err instanceof Error ? err : new Error(String(err))
    );
  } finally {
    isBroadcasting = false;
  }
}

/**
 * Initialize multi-tab listeners. Degrades gracefully if APIs are not supported.
 * Returns an unbind / cleanup function.
 */
export function initCrossTabSync(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  if (isInitialized) {
    return () => {};
  }
  isInitialized = true;

  const bc = getBroadcastChannel();

  // 1. BroadcastChannel listener
  const bcHandler = (ev: MessageEvent<CrossTabEvent>) => {
    if (ev?.data && typeof ev.data.type === "string") {
      handleCrossTabEvent(ev.data);
    }
  };

  if (bc) {
    bc.addEventListener("message", bcHandler);
  }

  // 2. Storage event listener (fallback & complementary for older browsers or background tabs)
  const storageHandler = (ev: StorageEvent) => {
    if (!ev.key) return;

    // Detect logout / token clearance
    if (ev.key === "tipz_auth_tokens" && ev.newValue === null) {
      handleCrossTabEvent({ type: "LOGOUT" });
      return;
    }

    // Detect wallet clearance
    if (
      (ev.key === "tipz-wallet" || ev.key === "tipz_tipz-wallet") &&
      ev.newValue === null
    ) {
      handleCrossTabEvent({ type: "WALLET_DISCONNECT" });
      return;
    }

    // Detect notifications read/update
    if (ev.key === "tipz_notifications" && ev.newValue) {
      try {
        const parsed = JSON.parse(ev.newValue) as {
          state?: { notifications?: unknown[] };
        };
        const items = parsed?.state?.notifications;
        if (Array.isArray(items)) {
          // If all notifications in the new state are read, mark all read locally
          const allRead = items.every(
            (n: any) => n && typeof n === "object" && n.unread === false
          );
          if (allRead) {
            handleCrossTabEvent({ type: "NOTIFICATION_ALL_READ" });
          }
        }
      } catch {
        // ignore parse error
      }
    }
  };

  window.addEventListener("storage", storageHandler);

  return () => {
    isInitialized = false;
    if (bc) {
      bc.removeEventListener("message", bcHandler);
      bc.close();
      channel = null;
    }
    window.removeEventListener("storage", storageHandler);
  };
}

export const crossTabSync = {
  broadcast: broadcastCrossTabEvent,
  init: initCrossTabSync,
  handle: handleCrossTabEvent,
};
