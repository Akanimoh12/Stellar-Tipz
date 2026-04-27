import { describe, it, expect, beforeEach } from "vitest";

import { useWalletStore } from "../walletStore";

describe("walletStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useWalletStore.setState({
      wallets: [],
      activeWalletKey: null,
      publicKey: null,
      connected: false,
      connecting: false,
      isReconnecting: false,
      error: null,
      network: "TESTNET",
      walletType: null,
      signingStatus: "idle",
    });
  });

  it("sets wallet address", () => {
    const store = useWalletStore.getState();
    store.setAddress("GA123", "freighter");

    expect(useWalletStore.getState().publicKey).toBe("GA123");
    expect(useWalletStore.getState().connected).toBe(true);
  });

  it("clears wallet on disconnect", () => {
    const store = useWalletStore.getState();
    store.setAddress("GA123", "freighter");
    store.clearAddress();

    expect(useWalletStore.getState().publicKey).toBeNull();
    expect(useWalletStore.getState().connected).toBe(false);
  });

  it("persists connected wallet state", () => {
    useWalletStore.getState().connect("GA123", "freighter");

    const persisted = localStorage.getItem("tipz_wallet");
    expect(persisted).not.toBeNull();
    expect(persisted).toContain("GA123");
  });

  it("handles concurrent state updates", () => {
    const store = useWalletStore.getState();
    store.connect("GA111", "freighter");
    store.setNetwork("PUBLIC");
    store.setSigningStatus("signing");

    expect(useWalletStore.getState().publicKey).toBe("GA111");
    expect(useWalletStore.getState().network).toBe("PUBLIC");
    expect(useWalletStore.getState().signingStatus).toBe("signing");
  });
});
