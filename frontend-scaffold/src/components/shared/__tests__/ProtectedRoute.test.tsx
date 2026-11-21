import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import ProtectedRoute from "../ProtectedRoute";

expect.extend(toHaveNoViolations);

const mockWallet = vi.hoisted(() => ({
  connected: false,
  isReconnecting: false,
  walletType: null as string | null,
}));

const mockAddToast = vi.fn();

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
}));

vi.mock("@/store/toastStore", () => ({
  useToastStore: () => ({
    addToast: mockAddToast,
  }),
}));

const LocationConsumer: React.FC = () => {
  const location = useLocation();
  return (
    <div data-testid="location-info">
      <span data-testid="current-path">{location.pathname}</span>
      <span data-testid="redirect-from">{(location.state as any)?.from}</span>
    </div>
  );
};

interface RenderAppOptions {
  initialPath?: string;
}

const renderWithRouter = (
  child: React.ReactNode = <div>Protected Content</div>,
  options: RenderAppOptions = {},
) => {
  const initialPath = options.initialPath || "/dashboard";

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/dashboard"
          element={<ProtectedRoute>{child}</ProtectedRoute>}
        />
        <Route
          path="/protected-settings"
          element={<ProtectedRoute>{child}</ProtectedRoute>}
        />
        <Route
          path="/"
          element={
            <div>
              <h1>Home Page</h1>
              <LocationConsumer />
            </div>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
};

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWallet.connected = false;
    mockWallet.isReconnecting = false;
    mockWallet.walletType = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Rendering", () => {
    it("renders children when wallet is connected", () => {
      mockWallet.connected = true;

      renderWithRouter(
        <div data-testid="protected-card">Secret Creator Area</div>,
      );

      expect(screen.getByTestId("protected-card")).toBeInTheDocument();
      expect(screen.getByText("Secret Creator Area")).toBeInTheDocument();
      expect(screen.queryByTestId("reconnect-loader")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Home Page" })).not.toBeInTheDocument();
    });

    it("does not render children and redirects to / when wallet is not connected", () => {
      mockWallet.connected = false;

      renderWithRouter(
        <div data-testid="protected-card">Secret Creator Area</div>,
      );

      expect(screen.queryByTestId("protected-card")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Home Page" })).toBeInTheDocument();
    });

    it("renders reconnect loader when isReconnecting is true and not yet connected", () => {
      mockWallet.connected = false;
      mockWallet.isReconnecting = true;

      renderWithRouter(
        <div data-testid="protected-card">Secret Creator Area</div>,
      );

      expect(screen.getByTestId("reconnect-loader")).toBeInTheDocument();
      expect(screen.queryByTestId("protected-card")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Home Page" })).not.toBeInTheDocument();
    });

    it("renders reconnect loader during auto-reconnect window when walletType exists", () => {
      mockWallet.connected = false;
      mockWallet.walletType = "freighter";

      renderWithRouter(
        <div data-testid="protected-card">Secret Creator Area</div>,
      );

      expect(screen.getByTestId("reconnect-loader")).toBeInTheDocument();
      expect(screen.queryByTestId("protected-card")).not.toBeInTheDocument();
    });

    it("redirects to / after reconnect timeout elapses when connection fails", () => {
      vi.useFakeTimers();
      mockWallet.connected = false;
      mockWallet.walletType = "freighter";

      renderWithRouter(
        <div data-testid="protected-card">Secret Creator Area</div>,
      );

      expect(screen.getByTestId("reconnect-loader")).toBeInTheDocument();

      // Fast-forward 5000ms (RECONNECT_TIMEOUT_MS)
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.queryByTestId("reconnect-loader")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Home Page" })).toBeInTheDocument();
    });
  });

  describe("Key interactions", () => {
    it("preserves previous location pathname and search in redirect state", () => {
      mockWallet.connected = false;

      renderWithRouter(<div>Protected Content</div>, {
        initialPath: "/protected-settings?ref=sidebar&sort=desc",
      });

      expect(screen.getByTestId("current-path")).toHaveTextContent("/");
      expect(screen.getByTestId("redirect-from")).toHaveTextContent(
        "/protected-settings?ref=sidebar&sort=desc",
      );
    });

    it("shows info toast when accessing protected route unauthenticated", () => {
      mockWallet.connected = false;

      renderWithRouter();

      expect(mockAddToast).toHaveBeenCalledWith({
        message: "Please connect your wallet to access this page",
        type: "info",
        duration: 3000,
      });
    });

    it("does not show info toast while isReconnecting is true", () => {
      mockWallet.connected = false;
      mockWallet.isReconnecting = true;

      renderWithRouter();

      expect(mockAddToast).not.toHaveBeenCalled();
    });

    it("supports keyboard interactions on interactive child elements when connected", async () => {
      mockWallet.connected = true;
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const handleKeyDown = vi.fn();

      renderWithRouter(
        <div>
          <button
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            data-testid="interactive-btn"
          >
            Claim Rewards
          </button>
          <input data-testid="protected-input" placeholder="Enter note" />
        </div>,
      );

      const button = screen.getByTestId("interactive-btn");
      const input = screen.getByTestId("protected-input");

      // Test Tab navigation
      await user.tab();
      expect(button).toHaveFocus();

      // Test keyboard activation (Enter)
      await user.keyboard("{Enter}");
      expect(handleClick).toHaveBeenCalled();

      // Test Tab navigation to input
      await user.tab();
      expect(input).toHaveFocus();

      // Test typing inside protected input
      await user.keyboard("Monthly tip batch");
      expect(input).toHaveValue("Monthly tip batch");
    });

    it("clears timeout timer on unmount without throwing errors", () => {
      vi.useFakeTimers();
      mockWallet.connected = false;
      mockWallet.walletType = "freighter";

      const { unmount } = renderWithRouter();

      expect(screen.getByTestId("reconnect-loader")).toBeInTheDocument();
      expect(() => unmount()).not.toThrow();

      // Advance timers after unmount to ensure no state updates on unmounted component
      act(() => {
        vi.advanceTimersByTime(5000);
      });
    });
  });

  describe("Accessibility attributes", () => {
    it("renders reconnect loader with accessible status role and aria attributes", () => {
      mockWallet.connected = false;
      mockWallet.isReconnecting = true;

      renderWithRouter();

      const statusElement = screen.getByRole("status");
      expect(statusElement).toBeInTheDocument();
      expect(statusElement).toHaveAttribute("aria-live", "polite");
      expect(statusElement).toHaveAttribute("aria-busy", "true");
    });

    it("has no accessibility violations when showing reconnect loader", async () => {
      mockWallet.connected = false;
      mockWallet.isReconnecting = true;

      const { container } = renderWithRouter();

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no accessibility violations when user is authenticated and viewing content", async () => {
      mockWallet.connected = true;

      const { container } = renderWithRouter(
        <main>
          <h1>Dashboard Overview</h1>
          <p>Welcome back, creator!</p>
          <button type="button">Manage Settings</button>
        </main>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
