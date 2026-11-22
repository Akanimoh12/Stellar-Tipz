import React from "react";
import { act, render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

import LeaderboardPage from "../../features/leaderboard/LeaderboardPage";
import * as soroban from "../../services/soroban";
import type { LeaderboardEntry } from "../../types/contract";

vi.mock("../../hooks/usePageMeta", () => ({
  usePageMeta: vi.fn(),
}));

vi.mock("../../hooks", () => ({
  useWallet: () => ({ publicKey: null, signTransaction: vi.fn() }),
}));

vi.mock("../../store/walletStore", () => ({
  useWalletStore: () => ({ network: "TESTNET" }),
}));

vi.mock("../../helpers/env", () => ({
  env: {
    contractId: "C1234567890",
    horizonUrl: "https://horizon-testnet.stellar.org",
    useMockData: false,
  },
}));

const mockEntries: LeaderboardEntry[] = [
  {
    address: "GABC123",
    username: "alice",
    totalTipsReceived: "1000",
    creditScore: 80,
  },
];

let fetchSpy: ReturnType<typeof vi.spyOn>;

describe("Leaderboard optimization", () => {
  beforeEach(() => {
    soroban.invalidateLeaderboardCache();
    fetchSpy = vi.spyOn(soroban, "getLeaderboard").mockResolvedValue(mockEntries);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    soroban.invalidateLeaderboardCache();
    vi.useRealTimers();
  });

  it("caches leaderboard data", async () => {
    const { rerender: rerenderPage } = render(
      <BrowserRouter>
        <LeaderboardPage />
      </BrowserRouter>,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rerenderPage(
      <BrowserRouter>
        <LeaderboardPage />
      </BrowserRouter>,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refreshes after TTL", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    await act(async () => {
      render(
        <BrowserRouter>
          <LeaderboardPage />
        </BrowserRouter>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(soroban.LEADERBOARD_CACHE_TTL_MS);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  }, 15_000);
});
