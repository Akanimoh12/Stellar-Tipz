import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: vi.fn() }));
vi.mock("@/hooks/useTheme", () => ({ useTheme: vi.fn() }));
vi.mock("@/hooks/useWallet", () => ({ useWallet: vi.fn() }));
vi.mock("@/hooks/useKeyboardShortcuts", () => ({
  getModifierKey: () => "Ctrl",
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        "nav.navigation": "Navigation",
        "nav.closeMenu": "Close menu",
        "nav.mobile": "Mobile navigation",
        "nav.leaderboard": "Leaderboard",
        "nav.transactions": "Transactions",
        "nav.profile": "Profile",
        "nav.theme": "Theme",
        "nav.network": "Network",
        "wallet.connect": "Connect wallet",
        "common.dark": "dark",
        "common.light": "light",
      };
      if (key === "theme.switchTo") return `Switch to ${values?.mode} mode`;
      if (key === "shortcuts.keyboard")
        return `Keyboard shortcuts ${values?.shortcut}`;
      if (key === "wallet.disconnectWithAddress") {
        return `Disconnect ${values?.address}`;
      }
      return labels[key] ?? key;
    },
  }),
}));
vi.mock("../../shared/NetworkBadge", () => ({
  default: () => <span>Testnet</span>,
}));
vi.mock("../../shared/WalletSwitcher", () => ({
  default: ({ onAddWallet }: { onAddWallet: () => void }) => (
    <button type="button" onClick={onAddWallet}>
      Add wallet
    </button>
  ),
}));

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTheme } from "@/hooks/useTheme";
import { useWallet } from "@/hooks/useWallet";
import MobileDrawer from "../MobileDrawer";

const mockUseReducedMotion = vi.mocked(useReducedMotion);
const mockUseTheme = vi.mocked(useTheme);
const mockUseWallet = vi.mocked(useWallet);

const toggleTheme = vi.fn();
const connect = vi.fn().mockResolvedValue(undefined);
const disconnect = vi.fn();

function renderDrawer(
  props: Partial<React.ComponentProps<typeof MobileDrawer>> = {},
  route = "/dashboard",
) {
  const onClose = props.onClose ?? vi.fn();
  const onKeyboardShortcuts = props.onKeyboardShortcuts ?? vi.fn();
  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <MobileDrawer
        isOpen={true}
        onClose={onClose}
        navDashboard="My dashboard"
        onKeyboardShortcuts={onKeyboardShortcuts}
        {...props}
      />
    </MemoryRouter>,
  );
  return { ...view, onClose, onKeyboardShortcuts };
}

describe("MobileDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
    mockUseReducedMotion.mockReturnValue(false);
    mockUseTheme.mockReturnValue({
      theme: "light",
      toggleTheme,
      setTheme: vi.fn(),
    });
    mockUseWallet.mockReturnValue({
      connected: false,
      publicKey: null,
      connect,
      disconnect,
    } as ReturnType<typeof useWallet>);
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("renders nothing while closed", () => {
    const { container } = renderDrawer({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("exposes dialog and navigation semantics with the current page", () => {
    renderDrawer();

    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Close menu" }),
    ).toBeInTheDocument();
  });

  it("closes from the close button, navigation link, backdrop, and Escape", () => {
    const { onClose } = renderDrawer();
    const dialog = screen.getByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    fireEvent.click(screen.getByRole("link", { name: "Leaderboard" }));
    fireEvent.mouseDown(dialog.parentElement!);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it("does not close when interaction stays inside the drawer", () => {
    const { onClose } = renderDrawer();

    fireEvent.mouseDown(screen.getByRole("dialog"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("runs theme, shortcut, and wallet actions", () => {
    const onKeyboardShortcuts = vi.fn();
    const { onClose } = renderDrawer({ onKeyboardShortcuts });

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );
    expect(toggleTheme).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "Keyboard shortcuts Ctrl + /" }),
    );
    expect(onKeyboardShortcuts).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(connect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("disconnects a connected wallet and shows its shortened address", () => {
    mockUseWallet.mockReturnValue({
      connected: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD",
      connect,
      disconnect,
    } as ReturnType<typeof useWallet>);
    const { onClose } = renderDrawer();

    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect GABC...ABCD" }),
    );

    expect(disconnect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("locks page scrolling, focuses the first control, and restores on cleanup", async () => {
    document.body.style.overflow = "scroll";
    const { unmount } = renderDrawer();

    expect(document.body).toHaveStyle({ overflow: "hidden" });
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "TIPZ*" })).toHaveFocus(),
    );

    unmount();

    expect(document.body).toHaveStyle({ overflow: "scroll" });
  });

  it("traps keyboard focus within the open dialog", async () => {
    renderDrawer();
    const dialog = screen.getByRole("dialog");
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    await waitFor(() => expect(first).toHaveFocus());

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("closes on a right swipe unless reduced motion is enabled", () => {
    const { onClose, unmount } = renderDrawer();
    const dialog = screen.getByRole("dialog");

    fireEvent.pointerDown(dialog, { clientX: 10 });
    fireEvent.pointerUp(dialog, { clientX: 100 });

    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    mockUseReducedMotion.mockReturnValue(true);
    const reducedMotionDrawer = renderDrawer();
    const reducedMotionDialog = screen.getByRole("dialog");

    fireEvent.pointerDown(reducedMotionDialog, { clientX: 10 });
    fireEvent.pointerUp(reducedMotionDialog, { clientX: 100 });

    expect(reducedMotionDrawer.onClose).not.toHaveBeenCalled();
  });
});
