/**
 * Tests for multi-wallet support:
 *  - WalletSwitcher component
 *  - walletStore multi-wallet actions
 *
 * Matches the spec test cases:
 *   describe('Multi-wallet', ...)
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { useWalletStore } from "../../store/walletStore";
import WalletSwitcher from "../WalletSwitcher";

// ── helpers ─────────────────────────────────────────────────────────────────

const KEY_A = "GABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890123456789AB";
const KEY_B = "GEFGHIJKLMNOPQRSTUVWXYZ0123456789012345678901234567890ACBD";

function connectWallet(key: string, type = "freighter") {
  act(() => useWalletStore.getState().connect(key, type));
}

function getActiveWallet() {
  return useWalletStore.getState().activeWalletKey;
}

// Mock useBalance so we don't hit the network in tests
vi.mock("../../hooks/useBalance", () => ({
  useBalance: () => ({ balance: "100.00", loading: false, error: null }),
}));

// ── walletStore multi-wallet unit tests ─────────────────────────────────────

describe("walletStore – multi-wallet", () => {
  beforeEach(() => {
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

  it("connect() adds first wallet and marks it active", () => {
    connectWallet(KEY_A);
    const state = useWalletStore.getState();
    expect(state.wallets).toHaveLength(1);
    expect(state.activeWalletKey).toBe(KEY_A);
    expect(state.connected).toBe(true);
  });

  it("connect() adds a second wallet and switches active to it", () => {
    connectWallet(KEY_A);
    connectWallet(KEY_B, "albedo");
    const state = useWalletStore.getState();
    expect(state.wallets).toHaveLength(2);
    expect(state.activeWalletKey).toBe(KEY_B);
  });

  it("connect() does not duplicate an already-connected wallet", () => {
    connectWallet(KEY_A);
    connectWallet(KEY_A);
    expect(useWalletStore.getState().wallets).toHaveLength(1);
  });

  it("setActiveWallet() switches active wallet without removing others", () => {
    connectWallet(KEY_A);
    connectWallet(KEY_B);
    act(() => useWalletStore.getState().setActiveWallet(KEY_A));
    expect(getActiveWallet()).toBe(KEY_A);
    expect(useWalletStore.getState().wallets).toHaveLength(2);
  });

  it("removeWallet() removes specific wallet and falls back to next", () => {
    connectWallet(KEY_A);
    connectWallet(KEY_B);
    act(() => useWalletStore.getState().removeWallet(KEY_B));
    const state = useWalletStore.getState();
    expect(state.wallets).toHaveLength(1);
    expect(state.activeWalletKey).toBe(KEY_A);
    expect(state.connected).toBe(true);
  });

  it("removeWallet() sets connected=false when last wallet removed", () => {
    connectWallet(KEY_A);
    act(() => useWalletStore.getState().removeWallet(KEY_A));
    const state = useWalletStore.getState();
    expect(state.wallets).toHaveLength(0);
    expect(state.connected).toBe(false);
    expect(state.activeWalletKey).toBeNull();
  });

  it("disconnect() clears all wallets", () => {
    connectWallet(KEY_A);
    connectWallet(KEY_B);
    act(() => useWalletStore.getState().disconnect());
    const state = useWalletStore.getState();
    expect(state.wallets).toHaveLength(0);
    expect(state.connected).toBe(false);
  });
});

// ── WalletSwitcher component tests ───────────────────────────────────────────

describe("Multi-wallet", () => {
  const mockOnAddWallet = vi.fn();

  beforeEach(() => {
    mockOnAddWallet.mockReset();
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

  it("renders nothing when no wallets connected", () => {
    const { container } = render(
      <WalletSwitcher onAddWallet={mockOnAddWallet} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("connects second wallet", async () => {
    // Connect first wallet
    connectWallet(KEY_A);

    render(<WalletSwitcher onAddWallet={mockOnAddWallet} />);

    // Open the dropdown
    await userEvent.click(screen.getByRole("button", { name: /wallet switcher/i }));

    // Click "Add wallet"
    await userEvent.click(screen.getByText(/add wallet/i));

    // onAddWallet is called (which opens the kit modal in real usage)
    expect(mockOnAddWallet).toHaveBeenCalledTimes(1);

    // Simulate the kit modal resolving – connect second wallet
    connectWallet(KEY_B, "albedo");

    // Re-render with updated store
    render(<WalletSwitcher onAddWallet={mockOnAddWallet} />);
    await userEvent.click(screen.getAllByRole("button", { name: /wallet switcher/i })[1]);

    // Both wallets show as options
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("switches active wallet", async () => {
    connectWallet(KEY_A);
    connectWallet(KEY_B);

    render(<WalletSwitcher onAddWallet={mockOnAddWallet} />);

    // Open dropdown
    await userEvent.click(screen.getByRole("button", { name: /wallet switcher/i }));

    // Click the KEY_B wallet option (truncated label)
    const keyBLabel = `${KEY_B.slice(0, 4)}...${KEY_B.slice(-4)}`;
    const gefghOption = screen.getByRole("option", {
      name: new RegExp(keyBLabel, "i"),
    });
    await userEvent.click(gefghOption);

    expect(getActiveWallet()).toBe(KEY_B);
  });

  it("shows both wallets in the dropdown", async () => {
    connectWallet(KEY_A);
    connectWallet(KEY_B);

    render(<WalletSwitcher onAddWallet={mockOnAddWallet} />);
    await userEvent.click(screen.getByRole("button", { name: /wallet switcher/i }));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
  });

  it("removes a wallet when trash button clicked", async () => {
    connectWallet(KEY_A);
    connectWallet(KEY_B);

    render(<WalletSwitcher onAddWallet={mockOnAddWallet} />);
    await userEvent.click(screen.getByRole("button", { name: /wallet switcher/i }));

    const keyALabel = `${KEY_A.slice(0, 4)}...${KEY_A.slice(-4)}`;
    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(`remove wallet ${keyALabel}`, "i") }),
    );

    expect(useWalletStore.getState().wallets).toHaveLength(1);
  });

  it("disconnects all wallets", async () => {
    connectWallet(KEY_A);
    connectWallet(KEY_B);

    render(<WalletSwitcher onAddWallet={mockOnAddWallet} />);
    await userEvent.click(screen.getByRole("button", { name: /wallet switcher/i }));

    await userEvent.click(screen.getByText(/disconnect all/i));

    expect(useWalletStore.getState().connected).toBe(false);
    expect(useWalletStore.getState().wallets).toHaveLength(0);
  });
});
