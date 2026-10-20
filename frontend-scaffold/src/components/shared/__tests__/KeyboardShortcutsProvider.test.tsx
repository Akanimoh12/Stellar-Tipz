import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import KeyboardShortcutsProvider from "../KeyboardShortcutsProvider";

expect.extend(toHaveNoViolations);

const mockNavigate = vi.fn();
let currentPathname = "/";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      pathname: currentPathname,
      search: "",
      hash: "",
      state: null,
      key: "default",
    }),
  };
});

vi.mock("@/store/walletStore", () => ({
  useWalletStore: () => ({ connected: true, network: "TESTNET" }),
}));

vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => ({
    query: "",
    results: [],
    isLoading: false,
    recentSearches: [],
    hasSearched: false,
    setQuery: vi.fn(),
    addToRecent: vi.fn(),
    clearRecent: vi.fn(),
  }),
}));

vi.mock("@/components/ui/Avatar", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("KeyboardShortcutsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPathname = "/";
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  describe("Rendering", () => {
    it("renders without crashing and keeps modals closed initially", () => {
      const { container } = render(<KeyboardShortcutsProvider />);
      expect(container).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders GlobalSearch modal when quick search shortcut is triggered", () => {
      render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "k", ctrlKey: true });

      const searchDialog = screen.getByRole("dialog", { name: /search/i });
      expect(searchDialog).toBeInTheDocument();
      expect(searchDialog).toHaveAttribute("aria-modal", "true");
    });

    it("renders ShortcutsModal when shortcuts help shortcut is triggered", () => {
      render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "/", ctrlKey: true });

      const helpDialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
      expect(helpDialog).toBeInTheDocument();
      expect(helpDialog).toHaveAttribute("aria-modal", "true");
    });
  });

  describe("Key interactions", () => {
    it("opens search with Ctrl+K / Meta+K and closes when toggled while blurred", () => {
      render(<KeyboardShortcutsProvider />);

      // Open with Ctrl+K
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(screen.getByRole("dialog", { name: /search/i })).toBeInTheDocument();

      // Blur searchbox so shortcut is recognized outside input typing
      const searchbox = screen.getByRole("searchbox");
      searchbox.blur();

      // Close with Ctrl+K
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(screen.queryByRole("dialog", { name: /search/i })).not.toBeInTheDocument();

      // Open with Meta+K (Cmd+K)
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      expect(screen.getByRole("dialog", { name: /search/i })).toBeInTheDocument();
    });

    it("toggles shortcuts help modal open and closed with Ctrl+/ / Meta+/", () => {
      render(<KeyboardShortcutsProvider />);

      // Open with Ctrl+/
      fireEvent.keyDown(window, { key: "/", ctrlKey: true });
      expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();

      // Close with Ctrl+/
      fireEvent.keyDown(window, { key: "/", ctrlKey: true });
      expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();

      // Open with Meta+/
      fireEvent.keyDown(window, { key: "/", metaKey: true });
      expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    });

    it("closes shortcuts modal when opening quick search", () => {
      render(<KeyboardShortcutsProvider />);

      // Open shortcuts modal
      fireEvent.keyDown(window, { key: "/", ctrlKey: true });
      expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();

      // Trigger quick search: should close shortcuts and open search
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: /search/i })).toBeInTheDocument();
    });

    it("navigates to Home on sequence 'g' then 'h'", () => {
      render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "g" });
      fireEvent.keyDown(window, { key: "h" });

      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("navigates to Leaderboard on sequence 'g' then 'l'", () => {
      render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "g" });
      fireEvent.keyDown(window, { key: "l" });

      expect(mockNavigate).toHaveBeenCalledWith("/leaderboard");
    });

    it("navigates to Dashboard on sequence 'g' then 'd'", () => {
      render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "g" });
      fireEvent.keyDown(window, { key: "d" });

      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    it("closes open shortcuts modal when sequence 'g' then 'h' is triggered", () => {
      render(<KeyboardShortcutsProvider />);

      // Open shortcuts modal
      fireEvent.keyDown(window, { key: "/", ctrlKey: true });
      expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();

      // Trigger 'g' then 'h'
      fireEvent.keyDown(window, { key: "g" });
      fireEvent.keyDown(window, { key: "h" });

      expect(mockNavigate).toHaveBeenCalledWith("/");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens search modal when pressing 't' on a non-tip page", () => {
      currentPathname = "/leaderboard";
      render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "t" });

      expect(screen.getByRole("dialog", { name: /search/i })).toBeInTheDocument();
    });

    it("focuses and selects tip amount input when pressing 't' on a tip page", () => {
      currentPathname = "/@alice";
      render(<KeyboardShortcutsProvider />);

      const tipInput = document.createElement("input");
      tipInput.setAttribute("data-tip-amount", "true");
      tipInput.focus = vi.fn();
      tipInput.select = vi.fn();
      document.body.appendChild(tipInput);

      fireEvent.keyDown(window, { key: "t" });

      expect(tipInput.focus).toHaveBeenCalled();
      expect(tipInput.select).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("clicks custom tip amount trigger button when input is not yet rendered", async () => {
      currentPathname = "/@bob";
      render(<KeyboardShortcutsProvider />);

      const triggerBtn = document.createElement("button");
      triggerBtn.setAttribute("data-tip-amount-trigger", "true");
      let clicked = false;
      triggerBtn.onclick = () => {
        clicked = true;
        const tipInput = document.createElement("input");
        tipInput.setAttribute("data-tip-amount", "true");
        tipInput.focus = vi.fn();
        tipInput.select = vi.fn();
        document.body.appendChild(tipInput);
      };
      document.body.appendChild(triggerBtn);

      fireEvent.keyDown(window, { key: "t" });

      expect(clicked).toBe(true);

      await waitFor(() => {
        const input = document.querySelector<HTMLInputElement>('[data-tip-amount="true"]');
        expect(input).not.toBeNull();
      });
    });

    it("closes any open modal on Escape key", () => {
      render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(screen.getByRole("dialog", { name: /search/i })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes modal when child onClose callback is called", () => {
      render(<KeyboardShortcutsProvider />);

      // Open shortcuts modal
      fireEvent.keyDown(window, { key: "/", ctrlKey: true });
      expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();

      // Click close button on modal
      const closeBtn = screen.getByRole("button", { name: /close/i });
      fireEvent.click(closeBtn);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("does not trigger navigation shortcuts when typing inside an input", () => {
      render(<KeyboardShortcutsProvider />);

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      fireEvent.keyDown(input, { key: "g" });
      fireEvent.keyDown(input, { key: "h" });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("still allows Escape key to close modals while inside an input", () => {
      render(<KeyboardShortcutsProvider />);

      // Open search modal
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(screen.getByRole("dialog", { name: /search/i })).toBeInTheDocument();

      const searchInput = screen.getByRole("searchbox", { name: /search creators/i });
      searchInput.focus();

      // Press Escape inside the input
      fireEvent.keyDown(searchInput, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility attributes", () => {
    it("renders modal with accessible dialog role and aria-modal attribute", () => {
      render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "/", ctrlKey: true });

      const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("has accessible searchbox with proper role and label in search modal", () => {
      render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "k", ctrlKey: true });

      const searchbox = screen.getByRole("searchbox", { name: /search creators/i });
      expect(searchbox).toBeInTheDocument();
      expect(searchbox).toHaveFocus();
    });

    it("has no accessibility violations when shortcuts modal is displayed", async () => {
      const { container } = render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "/", ctrlKey: true });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no accessibility violations when search modal is displayed", async () => {
      const { container } = render(<KeyboardShortcutsProvider />);

      fireEvent.keyDown(window, { key: "k", ctrlKey: true });

      const results = await axe(container, {
        rules: {
          "aria-required-children": { enabled: false },
        },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
