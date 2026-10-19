import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDashboard } from "../useDashboard";
import { useWalletStore } from "../../store/walletStore";
import { useContract } from "../useContract";
import { useToastStore } from "../../store/toastStore";
import { env } from "../helpers/env";
import { logger } from "../services/logger";
import { mockProfile, mockTips } from "../../features/mockData";

vi.mock("../../store/walletStore");
vi.mock("../useContract");
vi.mock("../../store/toastStore");
vi.mock("../helpers/env", () => ({
  env: { useMockData: false, horizonUrl: "https://horizon-testnet.stellar.org" },
}));
vi.mock("../services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockUseWalletStore = vi.mocked(useWalletStore);
const mockUseContract = vi.mocked(useContract);
const mockUseToastStore = vi.mocked(useToastStore);
const mockEnv = vi.mocked(env);

const mockGetProfile = vi.fn();
const mockGetStats = vi.fn();
const mockGetRecentTips = vi.fn();
const mockAddToast = vi.fn();

const PUBLIC_KEY = "GBZXN7PIRZGNMHGA6M44Q5X5V5JH7OD7TLFAGL5EXAMPLEA";

const mockStats = {
  totalCreators: 120,
  totalTipsCount: 1540,
  totalTipsVolume: "45000000000",
  totalFeesCollected: "900000000",
  feeBps: 200,
};

beforeEach(() => {
  mockUseWalletStore.mockReturnValue({ publicKey: PUBLIC_KEY, connected: true });
  mockUseContract.mockReturnValue({
    getProfile: mockGetProfile,
    getStats: mockGetStats,
    getRecentTips: mockGetRecentTips,
  });
  mockUseToastStore.mockReturnValue({ addToast: mockAddToast });
  mockEnv.useMockData = false;
  mockGetProfile.mockResolvedValue(mockProfile);
  mockGetStats.mockResolvedValue(mockStats);
  mockGetRecentTips.mockResolvedValue(mockTips);
  mockAddToast.mockClear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDashboard", () => {
  it("returns initial empty state", () => {
    const { result } = renderHook(() => useDashboard());

    expect(result.current.profile).toBeNull();
    expect(result.current.tips).toEqual([]);
    expect(result.current.stats).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("fetches dashboard data on success", async () => {
    const { result } = renderHook(() => useDashboard());

    await waitFor(() => {
      expect(result.current.profile).toEqual(mockProfile);
      expect(result.current.stats).toEqual(mockStats);
      expect(result.current.tips).toEqual(mockTips);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    expect(mockGetProfile).toHaveBeenCalledWith(PUBLIC_KEY);
    expect(mockGetStats).toHaveBeenCalled();
    expect(mockGetRecentTips).toHaveBeenCalledWith(PUBLIC_KEY, 10, 0);
  });

  it("uses mock data when env.useMockData is true (success)", () => {
    mockEnv.useMockData = true;

    const { result } = renderHook(() => useDashboard());

    expect(result.current.profile).toBeDefined();
    expect(result.current.tips.length).toBeGreaterThan(0);
    expect(result.current.stats).toBeDefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets an error when profile fetch fails (error path)", async () => {
    mockGetProfile.mockRejectedValue(new Error("Failed to fetch"));

    const { result } = renderHook(() => useDashboard());

    await waitFor(() => {
      expect(result.current.error).toBe("Failed to fetch profile");
      expect(result.current.loading).toBe(false);
    });
  });

  it("treats a not-registered error by clearing data", async () => {
    mockGetProfile.mockRejectedValue(new Error("profile not found"));

    const { result } = renderHook(() => useDashboard());

    await waitFor(() => {
      expect(result.current.profile).toBeNull();
      expect(result.current.stats).toBeNull();
      expect(result.current.tips).toEqual([]);
    });
  });

  it("refetch re-fetches dashboard data", async () => {
    const { result } = renderHook(() => useDashboard());

    await waitFor(() => expect(result.current.profile).toEqual(mockProfile));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(2));
  });

  it("applyOptimisticWithdrawal reduces the profile balance", () => {
    mockEnv.useMockData = true;

    const { result } = renderHook(() => useDashboard());

    const initial = result.current.profile?.balance;
    expect(initial).toBeDefined();

    act(() => {
      result.current.applyOptimisticWithdrawal("10000000");
    });

    expect(result.current.profile?.balance).toBe(
      (BigInt(initial || "0") - 10000000n).toString(),
    );
  });

  it("revertOptimisticWithdrawal restores the previous balance", () => {
    mockEnv.useMockData = true;

    const { result } = renderHook(() => useDashboard());

    const initial = result.current.profile?.balance;

    act(() => {
      result.current.applyOptimisticWithdrawal("10000000");
      result.current.revertOptimisticWithdrawal();
    });

    expect(result.current.profile?.balance).toBe(initial);
  });

  it("cleanup does not throw on unmount", () => {
    const { unmount } = renderHook(() => useDashboard());
    expect(() => unmount()).not.toThrow();
  });

  it("logs an error but does not crash when stats fetch fails", async () => {
    mockGetStats.mockRejectedValue(new Error("stats down"));

    const { result } = renderHook(() => useDashboard());

    await waitFor(() => {
      expect(result.current.profile).toEqual(mockProfile);
      expect(result.current.stats).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    expect(logger.error).toHaveBeenCalled();
  });

  it("logs an error but does not crash when tips fetch fails", async () => {
    mockGetRecentTips.mockRejectedValue(new Error("tips down"));

    const { result } = renderHook(() => useDashboard());

    await waitFor(() => {
      expect(result.current.tips).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    expect(logger.error).toHaveBeenCalled();
  });
});
