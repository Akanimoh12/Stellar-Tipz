import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n/config";
import { I18nProvider } from "@/i18n";

vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/hooks/useTheme", () => ({
  useTheme: vi.fn(),
}));

vi.mock("../../shared/NetworkBadge", () => ({
  default: () => <span data-testid="network-badge">TESTNET</span>,
}));

vi.mock("../../shared/WalletSwitcher", () => ({
  default: ({ onAddWallet }: { onAddWallet: () => void }) => (
    <button type="button" onClick={onAddWallet}>
      Wallet switcher
    </button>
  ),
}));

import { useTheme } from "@/hooks/useTheme";
import { useWallet } from "@/hooks/useWallet";

import MobileMenu from "../MobileMenu";

expect.extend(toHaveNoViolations);

const mockUseWallet = vi.mocked(useWallet);
const mockUseTheme = vi.mocked(useTheme);

const wcag21AaConfig = {
  runOnly: {
    type: "tag" as const,
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  },
};

const connect = vi.fn();
const disconnect = vi.fn();
const toggleTheme = vi.fn();

const setWallet = (connected: boolean) => {
  mockUseWallet.mockReturnValue({
    connected,
    publicKey: connected ? "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890WXYZ" : null,
    connect,
    disconnect,
  } as unknown as ReturnType<typeof useWallet>);
};

const setTheme = (theme: "light" | "dark") => {
  mockUseTheme.mockReturnValue({
    theme,
    resolvedTheme: theme,
    setTheme: vi.fn(),
    toggleTheme,
  });
};

const renderMenu = (
  props: Partial<React.ComponentProps<typeof MobileMenu>> = {},
) => {
  const onClose = props.onClose ?? vi.fn();
  const onKeyboardShortcuts = props.onKeyboardShortcuts ?? vi.fn();
  const menu = (isOpen: boolean) => (
    <I18nProvider>
      <MemoryRouter>
        <MobileMenu
          isOpen={isOpen}
          onClose={onClose}
          navDashboard="Dashboard"
          onKeyboardShortcuts={onKeyboardShortcuts}
        />
      </MemoryRouter>
    </I18nProvider>
  );
  const result = render(menu(props.isOpen ?? true));

  return {
    ...result,
    onClose,
    onKeyboardShortcuts,
    setOpen: (isOpen: boolean) => result.rerender(menu(isOpen)),
  };
};

describe("MobileMenu", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setWallet(false);
    setTheme("light");
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe("rendering", () => {
    it("renders nothing when closed", () => {
      renderMenu({ isOpen: false });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders the navigation links when open", () => {
      renderMenu();
      const nav = screen.getByRole("navigation", { name: "Mobile navigation" });

      expect(
        within(nav).getByRole("link", { name: "Leaderboard" }),
      ).toHaveAttribute("href", "/leaderboard");
      expect(
        within(nav).getByRole("link", { name: "Dashboard" }),
      ).toHaveAttribute("href", "/dashboard");
      expect(
        within(nav).getByRole("link", { name: "Transactions" }),
      ).toHaveAttribute("href", "/transactions");
      expect(
        within(nav).getByRole("link", { name: "Profile" }),
      ).toHaveAttribute("href", "/profile");
    });

    it("renders custom dashboard link content", () => {
      render(
        <I18nProvider>
          <MemoryRouter>
            <MobileMenu
              isOpen
              onClose={vi.fn()}
              navDashboard={<span>Dashboard (3)</span>}
              onKeyboardShortcuts={vi.fn()}
            />
          </MemoryRouter>
        </I18nProvider>,
      );

      expect(
        screen.getByRole("link", { name: "Dashboard (3)" }),
      ).toHaveAttribute("href", "/dashboard");
    });

    it("shows the connect button when no wallet is connected", () => {
      renderMenu();

      expect(
        screen.getByRole("button", { name: "Connect Wallet" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Wallet switcher" }),
      ).not.toBeInTheDocument();
    });

    it("shows the wallet switcher and network badge when connected", () => {
      setWallet(true);
      renderMenu();

      expect(
        screen.getByRole("button", { name: "Wallet switcher" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("network-badge")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Connect Wallet" }),
      ).not.toBeInTheDocument();
    });

    it("labels the theme toggle with the mode it switches to", () => {
      setTheme("dark");
      renderMenu();

      expect(
        screen.getByRole("button", { name: "Switch to Light mode" }),
      ).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("calls onClose when the close button is clicked", async () => {
      const user = userEvent.setup();
      const { onClose } = renderMenu();

      await user.click(
        screen.getByRole("button", { name: "Close navigation menu" }),
      );

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when a navigation link is clicked", async () => {
      const user = userEvent.setup();
      const { onClose } = renderMenu();

      await user.click(screen.getByRole("link", { name: "Transactions" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape is pressed", async () => {
      const user = userEvent.setup();
      const { onClose } = renderMenu();

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("ignores Escape when closed", async () => {
      const user = userEvent.setup();
      const { onClose } = renderMenu({ isOpen: false });

      await user.keyboard("{Escape}");

      expect(onClose).not.toHaveBeenCalled();
    });

    it("toggles the theme", async () => {
      const user = userEvent.setup();
      renderMenu();

      await user.click(
        screen.getByRole("button", { name: "Switch to Dark mode" }),
      );

      expect(toggleTheme).toHaveBeenCalledTimes(1);
    });

    it("opens keyboard shortcuts", async () => {
      const user = userEvent.setup();
      const { onKeyboardShortcuts } = renderMenu();

      await user.click(
        screen.getByRole("button", {
          name: /keyboard shortcuts \((ctrl|cmd) \+ \/\)/i,
        }),
      );

      expect(onKeyboardShortcuts).toHaveBeenCalledTimes(1);
    });

    it("connects the wallet and closes the menu", async () => {
      const user = userEvent.setup();
      const { onClose } = renderMenu();

      await user.click(screen.getByRole("button", { name: "Connect Wallet" }));

      expect(connect).toHaveBeenCalledTimes(1);
      expect(disconnect).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes the menu when the wallet switcher is used", async () => {
      const user = userEvent.setup();
      setWallet(true);
      const { onClose } = renderMenu();

      await user.click(screen.getByRole("button", { name: "Wallet switcher" }));

      expect(connect).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("removes the dialog after closing", async () => {
      const { setOpen } = renderMenu();
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      setOpen(false);

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });
  });

  describe("focus management", () => {
    it("moves focus to the close button on open", () => {
      renderMenu();

      expect(
        screen.getByRole("button", { name: "Close navigation menu" }),
      ).toHaveFocus();
    });

    it("wraps focus from the last control back to the first", async () => {
      const user = userEvent.setup();
      renderMenu();
      const close = screen.getByRole("button", {
        name: "Close navigation menu",
      });
      const connectButton = screen.getByRole("button", {
        name: "Connect Wallet",
      });

      connectButton.focus();
      await user.tab();

      expect(close).toHaveFocus();
    });

    it("wraps focus from the first control back to the last on Shift+Tab", async () => {
      const user = userEvent.setup();
      renderMenu();

      await user.tab({ shift: true });

      expect(
        screen.getByRole("button", { name: "Connect Wallet" }),
      ).toHaveFocus();
    });
  });

  describe("accessibility", () => {
    it("exposes a labelled modal dialog", () => {
      renderMenu();
      const dialog = screen.getByRole("dialog", { name: "Navigation" });

      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("gives icon-only buttons accessible names", () => {
      renderMenu();

      expect(
        screen.getByRole("button", { name: "Close navigation menu" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Switch to Dark mode" }),
      ).toBeInTheDocument();
    });

    it("uses non-submitting buttons for menu controls", () => {
      renderMenu();

      for (const name of [
        "Close navigation menu",
        "Switch to Dark mode",
        /keyboard shortcuts/i,
      ]) {
        expect(screen.getByRole("button", { name })).toHaveAttribute(
          "type",
          "button",
        );
      }
    });

    it("has no WCAG 2.1 AA axe violations", async () => {
      const { container } = renderMenu();

      expect(await axe(container, wcag21AaConfig)).toHaveNoViolations();
    });
  });
});
