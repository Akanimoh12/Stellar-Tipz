import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  handleCrossTabEvent,
  broadcastCrossTabEvent,
  initCrossTabSync,
} from "../crossTabSync";
import { useWalletStore } from "../../store/walletStore";
import { useNotificationStore } from "../../store/notificationStore";
import { useProfileStore } from "../../store/profileStore";
import { setTokens, getTokenManagerStatus } from "../auth/tokenManager";

describe("crossTabSync", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useWalletStore.setState({
      wallets: [],
      activeWalletKey: null,
      publicKey: null,
      connected: false,
    });
    useNotificationStore.setState({
      notifications: [],
    });
    useProfileStore.setState({
      profile: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles cross-tab logout: clears wallet, profile, tokens, and storage", () => {
    useWalletStore.getState().connect("GA_TEST_WALLET", "freighter");
    setTokens({ accessToken: "access123", refreshToken: "refresh123" });
    useProfileStore.setState({
      profile: {
        owner: "GA_TEST_WALLET",
        username: "testuser",
        displayName: "Test User",
        creditScore: 100,
        totalTipsReceived: "0",
        totalTipsCount: 0,
        balance: "0",
        registeredAt: 0,
        updatedAt: 0,
      },
    });
    localStorage.setItem("tipz_draft_1", "draft content");

    expect(useWalletStore.getState().connected).toBe(true);
    expect(getTokenManagerStatus()).toBe("authenticated");

    // Simulate receiving a LOGOUT event from another tab
    handleCrossTabEvent({ type: "LOGOUT" });

    expect(useWalletStore.getState().connected).toBe(false);
    expect(useWalletStore.getState().publicKey).toBeNull();
    expect(useProfileStore.getState().profile).toBeNull();
    expect(getTokenManagerStatus()).toBe("unauthenticated");
    expect(localStorage.getItem("tipz_draft_1")).toBeNull();
  });

  it("handles cross-tab wallet disconnect", () => {
    useWalletStore.getState().connect("GA_CONNECTED_WALLET", "freighter");
    expect(useWalletStore.getState().connected).toBe(true);

    handleCrossTabEvent({ type: "WALLET_DISCONNECT" });

    expect(useWalletStore.getState().connected).toBe(false);
    expect(useWalletStore.getState().publicKey).toBeNull();
  });

  it("handles cross-tab wallet connect", () => {
    expect(useWalletStore.getState().connected).toBe(false);

    handleCrossTabEvent({
      type: "WALLET_CONNECT",
      payload: { publicKey: "GA_OTHER_TAB_WALLET", walletType: "freighter" },
    });

    expect(useWalletStore.getState().connected).toBe(true);
    expect(useWalletStore.getState().publicKey).toBe("GA_OTHER_TAB_WALLET");
  });

  it("handles cross-tab notification read-state sync", () => {
    useNotificationStore.setState({
      notifications: [
        {
          id: "notif-1",
          type: "tip",
          title: "New Tip",
          message: "You got a tip",
          timestamp: Date.now(),
          unread: true,
        },
        {
          id: "notif-2",
          type: "system",
          title: "System",
          message: "Welcome",
          timestamp: Date.now(),
          unread: true,
        },
      ],
    });

    handleCrossTabEvent({
      type: "NOTIFICATION_READ",
      payload: { id: "notif-1" },
    });

    const notifs = useNotificationStore.getState().notifications;
    expect(notifs.find((n) => n.id === "notif-1")?.unread).toBe(false);
    expect(notifs.find((n) => n.id === "notif-2")?.unread).toBe(true);

    handleCrossTabEvent({ type: "NOTIFICATION_ALL_READ" });
    const allRead = useNotificationStore.getState().notifications;
    expect(allRead.every((n) => !n.unread)).toBe(true);
  });

  it("degrades gracefully when BroadcastChannel is unsupported", () => {
    const originalBC = globalThis.BroadcastChannel;
    // @ts-expect-error simulate environments without BroadcastChannel
    delete globalThis.BroadcastChannel;

    expect(() => {
      broadcastCrossTabEvent({ type: "LOGOUT" });
      const cleanup = initCrossTabSync();
      cleanup();
    }).not.toThrow();

    globalThis.BroadcastChannel = originalBC;
  });
});
