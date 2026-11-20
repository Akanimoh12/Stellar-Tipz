import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

import LandingPage from "../LandingPage";
import { I18nProvider } from "@/i18n";
import * as walletHook from "@/hooks/useWallet";

const mockConnect = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/helpers/env", () => ({
  env: {
    contractId: "C1234567890",
    useMockData: false,
  },
}));

vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/hooks", () => ({
  useContract: () => ({
    getStats: vi.fn().mockResolvedValue({ totalCreators: 15, totalTipsAmount: "1000000000" }),
    getLeaderboard: vi.fn().mockResolvedValue([]),
  }),
  useWallet: () => ({
    connected: false,
    connect: mockConnect,
    address: "",
  }),
}));

vi.mock("@/hooks/useTrendingCreators", () => ({
  useTrendingCreators: () => ({
    creators: [
      {
        rank: 1,
        address: "GCREATOR1",
        username: "creator_one",
        displayName: "Creator One",
        creditScore: 95,
        weeklyTips: "50000000",
        isFallback: false,
      },
    ],
    loading: false,
    isFallback: false,
    refetch: vi.fn(),
  }),
}));

describe("LandingPage Keyboard Navigation Audit (#1688)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(walletHook.useWallet).mockReturnValue({
      connected: false,
      connect: mockConnect,
      address: "",
      publicKey: "",
      network: "TESTNET",
      connecting: false,
      disconnect: vi.fn(),
    } as any);
  });

  it("ensures main container is keyboard focusable for skip navigation", () => {
    render(
      <BrowserRouter>
        <I18nProvider>
          <LandingPage />
        </I18nProvider>
      </BrowserRouter>
    );

    const main = document.getElementById("main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("allows keyboard users to reach and activate Hero interactive buttons with Enter and Space", async () => {
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <I18nProvider>
          <LandingPage />
        </I18nProvider>
      </BrowserRouter>
    );

    const getStartedButton = screen.getByRole("button", { name: /get started/i });
    expect(getStartedButton).toBeInTheDocument();

    // Tab to button and activate with Enter
    getStartedButton.focus();
    expect(document.activeElement).toBe(getStartedButton);

    fireEvent.keyDown(getStartedButton, { key: "Enter", code: "Enter" });
    expect(mockConnect).toHaveBeenCalled();

    // Activate with Space
    fireEvent.keyDown(getStartedButton, { key: " ", code: "Space" });
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it("allows keyboard users to navigate and activate CTA buttons", () => {
    render(
      <BrowserRouter>
        <I18nProvider>
          <LandingPage />
        </I18nProvider>
      </BrowserRouter>
    );

    const browseButton = screen.getByRole("button", { name: /browse creators/i });
    expect(browseButton).toBeInTheDocument();

    browseButton.focus();
    expect(document.activeElement).toBe(browseButton);

    fireEvent.click(browseButton);
    expect(mockNavigate).toHaveBeenCalledWith("/leaderboard");
  });

  it("verifies interactive creator cards are reachable via keyboard and trigger navigation on Enter/Space", () => {
    render(
      <BrowserRouter>
        <I18nProvider>
          <LandingPage />
        </I18nProvider>
      </BrowserRouter>
    );

    const creatorCards = screen.getAllByRole("button", { name: /view profile of creator one/i });
    expect(creatorCards.length).toBeGreaterThan(0);

    const card = creatorCards[0];
    card.focus();
    expect(document.activeElement).toBe(card);

    fireEvent.keyDown(card, { key: "Enter", code: "Enter" });
    expect(mockNavigate).toHaveBeenCalledWith("/@creator_one");

    fireEvent.keyDown(card, { key: " ", code: "Space" });
    expect(mockNavigate).toHaveBeenCalledWith("/@creator_one");
  });
});
